package com.konolivepro.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.URL
import java.time.Duration
import java.time.Instant

class IncomingCallActivity : ComponentActivity() {
    private lateinit var call: IncomingCall
    private lateinit var api: SupabaseApi
    private var timer: CountDownTimer? = null
    private var handled = false
    private lateinit var remainingText: TextView
    private lateinit var callerPhoto: ImageView

    private val stateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.getStringExtra(CALL_ID) == call.callId) closeAsFinished()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        if (Build.VERSION.SDK_INT >= 30) window.setDecorFitsSystemWindows(false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.BLACK
        api = SupabaseApi(this)
        val raw = intent.getStringExtra(CallNotifications.EXTRA_CALL_JSON) ?: run { finish(); return }
        call = runCatching { IncomingCall.fromJson(JSONObject(raw)) }.getOrElse { finish(); return }
        val action = intent.getStringExtra(CallNotifications.EXTRA_ACTION)
        if (action == CallNotifications.ACTION_ACCEPT) { accept(); return }
        if (action == CallNotifications.ACTION_REJECT) { reject(); return }
        render()
        // Le premier écran natif est l’interface unique ; le service conserve son alerte sonore et vibratoire.
        // La notification qui a déclenché le Full-Screen Intent ne reste pas en bandeau par-dessus l’écran.
        CallNotifications.cancelIncoming(this)
        startAlerting()
        startExpiryTimer()
        ContextCompat.registerReceiver(this, stateReceiver, IntentFilter(ACTION_CALL_STATE), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    private fun render() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setBackgroundColor(Color.rgb(12, 15, 22))
            setPadding(AppStyle.dp(this@IncomingCallActivity, 24), AppStyle.dp(this@IncomingCallActivity, 34), AppStyle.dp(this@IncomingCallActivity, 24), AppStyle.dp(this@IncomingCallActivity, 24))
        }
        val label = TextView(this).apply {
            text = "Appel vidéo entrant"
            textSize = 16f
            setTextColor(Color.rgb(200, 210, 225))
            gravity = Gravity.CENTER
        }
        root.addView(label, LinearLayout.LayoutParams(-1, -2))

        callerPhoto = ImageView(this).apply {
            scaleType = ImageView.ScaleType.CENTER_CROP
            setImageDrawable(initialsDrawable(call.callerName))
            clipToOutline = true
        }
        root.addView(callerPhoto, LinearLayout.LayoutParams(AppStyle.dp(this, 148), AppStyle.dp(this, 148)).apply {
            gravity = Gravity.CENTER_HORIZONTAL
            topMargin = AppStyle.dp(this@IncomingCallActivity, 58)
        })
        if (call.callerPhoto.isNotBlank()) loadCallerPhoto(call.callerPhoto)

        root.addView(TextView(this).apply {
            text = call.callerName
            textSize = 29f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, AppStyle.dp(this@IncomingCallActivity, 20), 0, AppStyle.dp(this@IncomingCallActivity, 4))
        }, LinearLayout.LayoutParams(-1, -2))
        root.addView(TextView(this).apply {
            text = call.callerId.takeIf { it.isNotBlank() } ?: "Konolive"
            textSize = 15f
            setTextColor(Color.rgb(165, 177, 196))
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-1, -2))
        remainingText = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.rgb(145, 157, 176))
            gravity = Gravity.CENTER
            setPadding(0, AppStyle.dp(this@IncomingCallActivity, 14), 0, 0)
        }
        root.addView(remainingText, LinearLayout.LayoutParams(-1, -2))

        val spacer = View(this)
        root.addView(spacer, LinearLayout.LayoutParams(1, 0, 1f))
        val hint = TextView(this).apply {
            text = "Répondez à l’appel Konolive"
            textSize = 13f
            setTextColor(Color.rgb(165, 177, 196))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, AppStyle.dp(this@IncomingCallActivity, 14))
        }
        root.addView(hint, LinearLayout.LayoutParams(-1, -2))
        val actions = LinearLayout(this).apply { gravity = Gravity.CENTER; orientation = LinearLayout.HORIZONTAL }
        val reject = actionButton("Refuser", Color.rgb(198, 45, 52), "▼")
        val accept = actionButton("Accepter", Color.rgb(35, 155, 82), "▲")
        actions.addView(reject, LinearLayout.LayoutParams(0, AppStyle.dp(this, 66), 1f).apply { marginEnd = AppStyle.dp(this@IncomingCallActivity, 10) })
        actions.addView(accept, LinearLayout.LayoutParams(0, AppStyle.dp(this, 66), 1f))
        root.addView(actions, LinearLayout.LayoutParams(-1, -2))
        setContentView(root)
        reject.setOnClickListener { reject() }
        accept.setOnClickListener { accept() }
    }

    private fun actionButton(label: String, color: Int, symbol: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(AppStyle.dp(this@IncomingCallActivity, 10), AppStyle.dp(this@IncomingCallActivity, 7), AppStyle.dp(this@IncomingCallActivity, 10), AppStyle.dp(this@IncomingCallActivity, 7))
        background = android.graphics.drawable.GradientDrawable().apply { setColor(color); cornerRadius = AppStyle.dp(this@IncomingCallActivity, 18).toFloat() }
        elevation = AppStyle.dp(this@IncomingCallActivity, 5).toFloat()
        addView(TextView(this@IncomingCallActivity).apply { text = symbol; textSize = 18f; setTextColor(Color.WHITE); gravity = Gravity.CENTER })
        addView(TextView(this@IncomingCallActivity).apply { text = label; textSize = 12f; setTextColor(Color.WHITE); gravity = Gravity.CENTER; typeface = Typeface.DEFAULT_BOLD })
    }

    private fun initialsDrawable(name: String): android.graphics.drawable.Drawable {
        val drawable = android.graphics.drawable.GradientDrawable().apply { shape = android.graphics.drawable.GradientDrawable.OVAL; setColor(AppStyle.primaryDark) }
        return drawable
    }

    private fun loadCallerPhoto(photoUrl: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            val bitmap = runCatching { URL(photoUrl).openStream().use { BitmapFactory.decodeStream(it) } }.getOrNull()
            if (bitmap != null) withContext(Dispatchers.Main) { callerPhoto.setImageBitmap(bitmap) }
        }
    }

    private fun startAlerting() {
        // L’alerte est jouée par le service foreground, qui reste actif même
        // lorsque cette activité plein écran n’est pas lancée par Android 14.
        ContextCompat.startForegroundService(this, Intent(this, CallForegroundService::class.java).apply {
            putExtra(CallForegroundService.EXTRA_MODE, CallForegroundService.MODE_INCOMING)
            putExtra(CallNotifications.EXTRA_CALL_JSON, call.toJson().toString())
        })
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
                    startActivity(Intent(this@IncomingCallActivity, CallActivity::class.java).apply { putExtra(CallNotifications.EXTRA_CALL_JSON, call.toJson().toString()) })
                    finish()
                }
                .onFailure { handled = false; startAlerting() }
        }
    }

    private fun reject() = respondAndFinish("REJECTED")
    private fun expire() {
        if (handled) return
        CallNotifications.showMissed(this, call)
        respondAndFinish("EXPIRED")
    }

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
        CallForegroundService.stopIncoming(this)
    }

    override fun onDestroy() {
        stopAlerting()
        runCatching { unregisterReceiver(stateReceiver) }
        super.onDestroy()
    }
}
