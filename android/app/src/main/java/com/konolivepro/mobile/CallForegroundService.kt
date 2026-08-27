package com.konolivepro.mobile

import android.app.Service
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import org.json.JSONObject
import java.time.Duration
import java.time.Instant

class CallForegroundService : Service() {
    private var ringtonePlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private val handler = Handler(Looper.getMainLooper())
    private val expireRunnable = Runnable {
        stopAlerting()
        CallNotifications.cancelIncoming(this)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onCreate() {
        super.onCreate()
        CallNotifications.createChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.getStringExtra(EXTRA_ACTION) == ACTION_STOP) {
            stopAlerting()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val incomingOnly = intent?.getStringExtra(EXTRA_MODE) == MODE_INCOMING
        startForegroundFor(incomingOnly)
        if (incomingOnly) {
            scheduleExpiry(intent.getStringExtra(CallNotifications.EXTRA_CALL_JSON))
            startAlerting()
        }
        return START_NOT_STICKY
    }

    private fun startForegroundFor(incomingOnly: Boolean) {
        val notification = NotificationCompat.Builder(this, CallNotifications.STATE_CHANNEL)
            .setSmallIcon(R.drawable.ic_konolive)
            .setContentTitle(if (incomingOnly) "Konolive" else "Konolive — Appel en cours")
            .setContentText(if (incomingOnly) "Appel vidéo entrant" else "Appel en cours")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setOngoing(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .build()
        val foregroundType = when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q -> 0
            canUsePhoneCallType() -> ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            else -> ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, SERVICE_ID, notification, foregroundType)
        } else {
            startForeground(SERVICE_ID, notification)
        }
    }

    private fun scheduleExpiry(rawCall: String?) {
        handler.removeCallbacks(expireRunnable)
        val delay = runCatching {
            val expiresAt = rawCall?.let { JSONObject(it).optString(EXPIRES_AT) }.orEmpty()
            if (expiresAt.isBlank()) ALERT_TIMEOUT_MS
            else Duration.between(Instant.now(), Instant.parse(expiresAt)).toMillis().coerceAtLeast(1_000L)
        }.getOrDefault(ALERT_TIMEOUT_MS)
        handler.postDelayed(expireRunnable, delay)
    }

    private fun startAlerting() {
        if (ringtonePlayer?.isPlaying == true) return
        stopRingtone()
        val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

        wakeLock = getSystemService(PowerManager::class.java)?.let { powerManager ->
            @Suppress("DEPRECATION")
            powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "com.dalidycompte.konolive:IncomingCall",
            ).apply {
                setReferenceCounted(false)
                acquire(ALERT_TIMEOUT_MS)
            }
        }

        ringtonePlayer = runCatching {
            MediaPlayer.create(this, ringtoneUri)?.apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    setAudioAttributes(
                        AudioAttributes.Builder()
                            .setLegacyStreamType(AudioManager.STREAM_RING)
                            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    )
                }
                isLooping = true
                setVolume(1.0f, 1.0f)
                start()
            }
        }.getOrNull()

        vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION") getSystemService(Vibrator::class.java)
        }
        val pattern = longArrayOf(0, 900, 250, 900, 250, 900)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)
            vibrator?.vibrate(VibrationEffect.createWaveform(pattern, amplitudes, 0))
        } else {
            @Suppress("DEPRECATION") vibrator?.vibrate(pattern, 0)
        }
    }

    private fun stopRingtone() {
        ringtonePlayer?.let { player ->
            runCatching { if (player.isPlaying) player.stop() }
            runCatching { player.release() }
        }
        ringtonePlayer = null
    }

    private fun stopAlerting() {
        handler.removeCallbacks(expireRunnable)
        stopRingtone()
        vibrator?.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    private fun canUsePhoneCallType(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val ownsCalls = checkSelfPermission("android.permission.MANAGE_OWN_CALLS") == PackageManager.PERMISSION_GRANTED
        val roleManager = getSystemService(RoleManager::class.java)
        return ownsCalls || (roleManager?.isRoleHeld(RoleManager.ROLE_DIALER) == true)
    }

    override fun onDestroy() {
        stopAlerting()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val EXTRA_MODE = "foreground_mode"
        const val MODE_INCOMING = "incoming"
        const val EXTRA_ACTION = "service_action"
        const val ACTION_STOP = "stop_alerting"
        private const val SERVICE_ID = 7002
        private const val ALERT_TIMEOUT_MS = 65_000L

        fun stopIncoming(context: android.content.Context) {
            context.stopService(Intent(context, CallForegroundService::class.java))
        }
    }
}
