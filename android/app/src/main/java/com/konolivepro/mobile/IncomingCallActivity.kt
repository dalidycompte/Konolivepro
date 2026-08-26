package com.konolivepro.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.Duration

class IncomingCallActivity : ComponentActivity() {
    private lateinit var call: IncomingCall
    private lateinit var api: SupabaseApi
    private var ringtone: Ringtone? = null
    private var timer: CountDownTimer? = null
    private var handled = false
    private lateinit var remainingText: TextView

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.getStringExtra(CALL_ID) == call.callId) closeAsFinished()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true)
        if (Build.VERSION.SDK_INT >= 27) setTurnScreenOn(true)
        api = SupabaseApi(this)
        val raw = intent.getStringExtra(CallNotifications.EXTRA_CALL_JSON) ?: run { finish(); return }
        call = runCatching { IncomingCall.fromJson(JSONObject(raw)) }.getOrElse { finish(); return }
        val action = intent.getStringExtra(CallNotifications.EXTRA_ACTION)
        if (action == CallNotifications.ACTION_ACCEPT) { accept(); return }
        if (action == CallNotifications.ACTION_REJECT) { reject(); return }
        render()
        startAlerting()
        startExpiryTimer()
        ContextCompat.registerReceiver(this, stateReceiver, IntentFilter(ACTION_CALL_STATE), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    private fun render() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = android.view.Gravity.CENTER
            setPadding(40, 50, 40, 40)
        }
        val title = TextView(this).apply { text = "Appel vidéo entrant"; textSize = 18f }
        val caller = TextView(this).apply { text = call.callerName; textSize = 30f; setPadding(0, 25, 0, 10) }
        remainingText = TextView(this).apply { textSize = 16f }
        val buttons = LinearLayout(this).apply { gravity = android.view.Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
        val reject = Button(this).apply { text = "REFUSER"; setOnClickListener { reject() } }
        val accept = Button(this).apply { text = "ACCEPTER"; setOnClickListener { accept() } }
        buttons.addView(reject); buttons.addView(accept)
        root.addView(title); root.addView(caller); root.addView(remainingText); root.addView(buttons)
        setContentView(root)
    }

    private fun startAlerting() {
        ringtone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
        ringtone?.audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()
        ringtone?.play()
        val vibrator = getSystemService(Vibrator::class.java)
        val pattern = longArrayOf(0, 600, 300, 600)
        if (Build.VERSION.SDK_INT >= 26) vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0)) else @Suppress("DEPRECATION") vibrator?.vibrate(pattern, 0)
    }

    private fun startExpiryTimer() {
        val remaining = runCatching {
            Duration.between(Instant.now(), Instant.parse(call.expiresAt)).toMillis().coerceAtLeast(1_000)
        }.getOrDefault(60_000L)
        timer = object : CountDownTimer(remaining, 1_000) {
            override fun onTick(millisUntilFinished: Long) { remainingText.text = "Expire dans ${millisUntilFinished / 1_000}s" }
            override fun onFinish() { expire() }
        }.start()
    }

    private fun accept() {
        if (handled) return
        handled = true
        stopAlerting()
        lifecycleScope.launch {
            runCatching { api.respondToCall(call.callId, "ACCEPTED") }
                .onSuccess {
                    CallNotifications.cancelIncoming(this@IncomingCallActivity)
                    startActivity(Intent(this@IncomingCallActivity, CallActivity::class.java).apply {
                        putExtra(CallNotifications.EXTRA_CALL_JSON, call.toJson().toString())
                    })
                    finish()
                }
                .onFailure { handled = false; startAlerting() }
        }
    }

    private fun reject() = respondAndFinish("REJECTED")
    private fun expire() = respondAndFinish("EXPIRED")

    private fun respondAndFinish(action: String) {
        if (handled) return
        handled = true
        stopAlerting()
        lifecycleScope.launch {
            runCatching { api.respondToCall(call.callId, action) }
            CallNotifications.cancelIncoming(this@IncomingCallActivity)
            finish()
        }
    }

    private fun closeAsFinished() {
        handled = true
        stopAlerting()
        finish()
    }

    private fun stopAlerting() {
        timer?.cancel()
        ringtone?.stop()
        getSystemService(Vibrator::class.java)?.cancel()
    }

    override fun onDestroy() {
        stopAlerting()
        runCatching { unregisterReceiver(stateReceiver) }
        super.onDestroy()
    }
}
