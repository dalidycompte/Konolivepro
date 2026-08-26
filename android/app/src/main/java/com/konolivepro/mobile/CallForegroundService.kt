package com.konolivepro.mobile

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat

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
        startForeground(7002, notification)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

    override fun onBind(intent: Intent?): IBinder? = null
}
