package com.konolivepro.mobile

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.webrtc.AudioSource
import org.webrtc.EglBase
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraVideoCapturer
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

class CallActivity : ComponentActivity() {
    private lateinit var call: IncomingCall
    private lateinit var api: SupabaseApi
    private lateinit var remoteView: SurfaceViewRenderer
    private lateinit var localView: SurfaceViewRenderer
    private lateinit var status: TextView
    private var factory: PeerConnectionFactory? = null
    private var peer: PeerConnection? = null
    private var cameraCapturer: CameraVideoCapturer? = null
    private var cameraSource: VideoSource? = null
    private var localVideo: VideoTrack? = null
    private var localAudio: AudioTrack? = null
    private var realtime: RealtimeClient? = null
    private var surfaceHelper: SurfaceTextureHelper? = null
    private var monitorJob: Job? = null
    private var finishing = false
    private val eglBase: EglBase by lazy { EglBase.create() }
    private val pendingCandidates = mutableListOf<IceCandidate>()

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.CAMERA] == true && permissions[Manifest.permission.RECORD_AUDIO] == true) startWebRtc()
        else { status.text = "Autorisez la caméra et le microphone pour rejoindre l’appel."; end(false) }
    }

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.getStringExtra(CALL_ID) == call.callId && intent.getStringExtra(CALL_STATE) in listOf("REJECTED", "EXPIRED", "ENDED")) {
                end(false)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        api = SupabaseApi(this)
        val raw = intent.getStringExtra(CallNotifications.EXTRA_CALL_JSON) ?: run { finish(); return }
        call = runCatching { IncomingCall.fromJson(JSONObject(raw)) }.getOrElse { finish(); return }
        render()
        ContextCompat.registerReceiver(this, stateReceiver, IntentFilter(ACTION_CALL_STATE), ContextCompat.RECEIVER_NOT_EXPORTED)
        val missing = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO).filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) startWebRtc() else permissionLauncher.launch(missing.toTypedArray())
    }

    private fun render() {
        val root = FrameLayout(this)
        remoteView = SurfaceViewRenderer(this)
        localView = SurfaceViewRenderer(this)
        root.addView(remoteView, FrameLayout.LayoutParams(-1, -1))
        root.addView(localView, FrameLayout.LayoutParams(280, 420, Gravity.TOP or Gravity.END).apply { setMargins(0, 30, 20, 0) })
        val panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.BOTTOM; setPadding(24, 24, 24, 32) }
        status = TextView(this).apply { text = "Connexion à l’appel…"; textSize = 16f; setTextColor(0xffffffff.toInt()) }
        val controls = LinearLayout(this).apply { gravity = Gravity.CENTER }
        val mic = Button(this).apply { text = "Micro"; setOnClickListener { localAudio?.setEnabled(!(localAudio?.enabled() ?: true)) } }
        val camera = Button(this).apply { text = "Caméra"; setOnClickListener { localVideo?.setEnabled(!(localVideo?.enabled() ?: true)) } }
        val flip = Button(this).apply { text = "Changer"; setOnClickListener { cameraCapturer?.switchCamera(null) } }
        val hangup = Button(this).apply { text = "Raccrocher"; setOnClickListener { end(true) } }
        controls.addView(mic); controls.addView(camera); controls.addView(flip); controls.addView(hangup)
        panel.addView(status); panel.addView(controls)
        root.addView(panel, FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM))
        setContentView(root)
    }

    private fun startWebRtc() {
        startForegroundService(Intent(this, CallForegroundService::class.java))
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(this).setEnableInternalTracer(false).createInitializationOptions()
        )
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory()
        remoteView.init(eglBase.eglBaseContext, null)
        localView.init(eglBase.eglBaseContext, null)
        remoteView.setEnableHardwareScaler(true)
        localView.setEnableHardwareScaler(true)
        setupMedia()
        val iceServers = listOf(
            PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
            PeerConnection.IceServer.builder("stun:stun.cloudflare.com:3478").createIceServer(),
        )
        val config = PeerConnection.RTCConfiguration(iceServers)
        peer = factory?.createPeerConnection(config, observer)
        localAudio?.let { peer?.addTrack(it) }
        localVideo?.let { peer?.addTrack(it) }
        realtime = RealtimeClient(api, SessionStore(this).accessToken)
        realtime?.connect("call-${call.callId}", { event, payload -> handleSignal(event, payload) }) {
            realtime?.sendBroadcast("ready", JSONObject().put("from", SessionStore(this).userId ?: "android"))
        }
        status.text = "Appel accepté — établissement de la connexion…"
        monitorState()
    }

    private fun setupMedia() {
        val f = factory ?: return
        val audioConstraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("googEchoCancellation", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googNoiseSuppression", "true"))
            mandatory.add(MediaConstraints.KeyValuePair("googAutoGainControl", "true"))
        }
        localAudio = f.createAudioTrack("konolive-audio", f.createAudioSource(audioConstraints))
        cameraSource = f.createVideoSource(false)
        val enumerator = Camera2Enumerator(this)
        val cameraName = enumerator.deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
        if (cameraName != null) {
            cameraCapturer = enumerator.createCapturer(cameraName, null)
            surfaceHelper = SurfaceTextureHelper.create("KonoliveCamera", eglBase.eglBaseContext)
            cameraCapturer?.initialize(surfaceHelper, this, cameraSource?.capturerObserver)
            cameraCapturer?.startCapture(640, 480, 24)
            localVideo = f.createVideoTrack("konolive-video", cameraSource)
            localVideo?.addSink(localView)
        }
        localAudio?.setEnabled(true)
        localVideo?.setEnabled(true)
    }

    private val observer = object : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState) = Unit
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
            runOnUiThread { status.text = if (state == PeerConnection.IceConnectionState.CONNECTED || state == PeerConnection.IceConnectionState.COMPLETED) "Appel connecté" else "Connexion : ${state.name}" }
            if (state == PeerConnection.IceConnectionState.CONNECTED || state == PeerConnection.IceConnectionState.COMPLETED) {
                lifecycleScope.launch { runCatching { api.respondToCall(call.callId, "CONNECTED") } }
            }
        }
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) = Unit
        override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
        override fun onIceCandidate(candidate: IceCandidate) {
            realtime?.sendBroadcast("ice_candidate", JSONObject().apply {
                put("from", SessionStore(this@CallActivity).userId ?: "android")
                put("candidate", JSONObject().apply {
                    put("candidate", candidate.sdp)
                    put("sdpMid", candidate.sdpMid)
                    put("sdpMLineIndex", candidate.sdpMLineIndex)
                })
            })
        }
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) = Unit
        override fun onAddStream(stream: MediaStream) { stream.videoTracks.firstOrNull()?.addSink(remoteView) }
        override fun onRemoveStream(stream: MediaStream) = Unit
        override fun onDataChannel(channel: org.webrtc.DataChannel) = Unit
        override fun onRenegotiationNeeded() = Unit
        override fun onAddTrack(receiver: org.webrtc.RtpReceiver, streams: Array<out MediaStream>) {
            streams.firstOrNull()?.videoTracks?.firstOrNull()?.addSink(remoteView)
        }
    }

    private fun handleSignal(event: String, payload: JSONObject) {
        when (event) {
            "offer" -> lifecycleScope.launch {
                val sdp = payload.optJSONObject("sdp") ?: return@launch
                val description = SessionDescription(SessionDescription.Type.OFFER, sdp.optString("sdp"))
                peer?.setRemoteDescription(SimpleSdpObserver(), description)
                pendingCandidates.forEach { peer?.addIceCandidate(it) }
                pendingCandidates.clear()
                peer?.createAnswer(object : SimpleSdpObserver() {
                    override fun onCreateSuccess(answer: SessionDescription) {
                        peer?.setLocalDescription(SimpleSdpObserver(), answer)
                        realtime?.sendBroadcast("answer", JSONObject().put("from", SessionStore(this@CallActivity).userId ?: "android").put("sdp", JSONObject().put("type", "answer").put("sdp", answer.description)))
                    }
                }, MediaConstraints())
            }
            "ice_candidate" -> {
                val c = payload.optJSONObject("candidate") ?: return
                val candidate = IceCandidate(c.optString("sdpMid"), c.optInt("sdpMLineIndex"), c.optString("candidate"))
                if (peer?.remoteDescription != null) peer?.addIceCandidate(candidate) else pendingCandidates.add(candidate)
            }
            "call_end" -> runOnUiThread { end(false) }
        }
    }

    private fun monitorState() {
        monitorJob = lifecycleScope.launch {
            while (isActive && !finishing) {
                delay(2_000)
                val state = runCatching { api.getCallState(call.callId) }.getOrNull()
                if (state in listOf("REJECTED", "EXPIRED", "ENDED")) { end(false); break }
            }
        }
    }

    private fun end(notifyBackend: Boolean) {
        if (finishing) return
        finishing = true
        monitorJob?.cancel()
        if (notifyBackend) lifecycleScope.launch { runCatching { api.respondToCall(call.callId, "ENDED") }; cleanupAndFinish() }
        else cleanupAndFinish()
    }

    private fun cleanupAndFinish() {
        realtime?.sendBroadcast("call_end", JSONObject().put("call_id", call.callId))
        realtime?.close()
        peer?.close(); peer = null
        cameraCapturer?.let { runCatching { it.stopCapture() } }
        cameraCapturer?.dispose(); cameraSource?.dispose(); localAudio?.dispose()
        localView.release(); remoteView.release(); surfaceHelper?.dispose(); eglBase.release()
        stopService(Intent(this, CallForegroundService::class.java))
        CallNotifications.cancelIncoming(this)
        finish()
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(stateReceiver) }
        if (!finishing) { finishing = true; cleanupAndFinish() }
        super.onDestroy()
    }

    private open class SimpleSdpObserver : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) = Unit
        override fun onSetSuccess() = Unit
        override fun onCreateFailure(error: String) = Unit
        override fun onSetFailure(error: String) = Unit
    }
}
