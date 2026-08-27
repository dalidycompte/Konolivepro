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
        val notification = NotificationCompat.Builder(this, CallNotifications.STATE_CHANNEL)
            .setSmallIcon(R.drawable.ic_konolive)
            .setContentTitle("Konolive")
            .setContentText("Appel en cours")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setOngoing(true)
            .build()
        val foregroundType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && canUsePhoneCallType()) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
            0
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(this, 7002, notification, foregroundType)
        } else {
            startForeground(7002, notification)
        }
    }

    private fun canUsePhoneCallType(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
        val roleManager = getSystemService(RoleManager::class.java) ?: return false
        return roleManager.isRoleHeld(RoleManager.ROLE_DIALER)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onBind(intent: Intent?): IBinder? = null
}
