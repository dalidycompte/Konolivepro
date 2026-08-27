package com.konolivepro.mobile

import android.app.Service
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class CallForegroundService : Service() {
    override fun onCreate() {
        super.onCreate()
        CallNotifications.createChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val incomingOnly = intent?.getStringExtra(EXTRA_MODE) == MODE_INCOMING
        startForegroundFor(incomingOnly)
        return START_NOT_STICKY
    }

    private fun startForegroundFor(incomingOnly: Boolean) {
        val notification = NotificationCompat.Builder(this, CallNotifications.STATE_CHANNEL)
            .setSmallIcon(R.drawable.ic_konolive)
            .setContentTitle(if (incomingOnly) "Konolive" else "Konolive — Appel en cours")
            .setContentText(if (incomingOnly) "Préparation de l’appel entrant" else "Appel en cours")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .build()
        val foregroundType = when {
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q -> 0
            incomingOnly -> ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
            canUsePhoneCallType() -> ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            else -> ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, SERVICE_ID, notification, foregroundType)
        } else {
            startForeground(SERVICE_ID, notification)
        }
    }

    private fun canUsePhoneCallType(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val roleManager = getSystemService(RoleManager::class.java) ?: return false
        return roleManager.isRoleHeld(RoleManager.ROLE_DIALER)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val EXTRA_MODE = "foreground_mode"
        const val MODE_INCOMING = "incoming"
        private const val SERVICE_ID = 7002
    }
}
