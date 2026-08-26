package com.konolivepro.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.app.NotificationManagerCompat

object CallNotifications {
    const val CALL_CHANNEL = "konolive_calls"
    const val STATE_CHANNEL = "konolive_call_state"
    private const val INCOMING_ID = 7001

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val audio = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        manager.createNotificationChannel(NotificationChannel(CALL_CHANNEL, "Appels entrants", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Appels vidéo entrants Konolive"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 250, 500)
            setSound(ringtone, audio)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        })
        manager.createNotificationChannel(NotificationChannel(STATE_CHANNEL, "État des appels", NotificationManager.IMPORTANCE_LOW))
    }

    fun showIncoming(context: Context, call: IncomingCall) {
        createChannels(context)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val siteIntent = Intent(context, MainActivity::class.java).apply {
            putExtra(EXTRA_CALL_JSON, call.toJson().toString())
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val callIntent = Intent(context, IncomingCallActivity::class.java).apply {
            putExtra(EXTRA_CALL_JSON, call.toJson().toString())
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val fullScreen = PendingIntent.getActivity(context, call.callId.hashCode(), callIntent, flags)
        val person = Person.Builder().setName(call.callerName).setImportant(true).build()
        val builder = NotificationCompat.Builder(context, CALL_CHANNEL)
            .setSmallIcon(com.konolivepro.mobile.R.drawable.ic_konolive)
            .setContentTitle(call.callerName)
            .setContentText("Appel vidéo entrant")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(PendingIntent.getActivity(context, call.callId.hashCode() + 3, siteIntent, flags))
            .setVibrate(longArrayOf(0, 500, 250, 500))
        if (Build.VERSION.SDK_INT >= 31) {
            val decline = PendingIntent.getActivity(context, call.callId.hashCode() + 1,
                Intent(context, IncomingCallActivity::class.java).apply {
                    putExtra(EXTRA_CALL_JSON, call.toJson().toString()); putExtra(EXTRA_ACTION, ACTION_REJECT)
                }, flags)
            val answer = PendingIntent.getActivity(context, call.callId.hashCode() + 2,
                Intent(context, IncomingCallActivity::class.java).apply {
                    putExtra(EXTRA_CALL_JSON, call.toJson().toString()); putExtra(EXTRA_ACTION, ACTION_ACCEPT)
                }, flags)
            builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))
        }
        NotificationManagerCompat.from(context).notify(INCOMING_ID, builder.build())
    }

    fun cancelIncoming(context: Context) {
        NotificationManagerCompat.from(context).cancel(INCOMING_ID)
    }

    const val EXTRA_CALL_JSON = "extra_call_json"
    const val EXTRA_ACTION = "extra_action"
    const val ACTION_ACCEPT = "accept"
    const val ACTION_REJECT = "reject"
}
