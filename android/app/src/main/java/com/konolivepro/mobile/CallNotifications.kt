package com.konolivepro.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person

object CallNotifications {
    // Canal entrant dédié, aligné sur la configuration de l’application de référence.
    const val CALL_CHANNEL = "konolive_call_channel"
    const val STATE_CHANNEL = "konolive_call_state"
    private const val MISSED_CHANNEL = "konolive_missed_calls"
    private const val INCOMING_ID = 7001
    private const val MISSED_BASE_ID = 7300

    fun createChannels(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java)
        val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val ringtoneAudio = AudioAttributes.Builder()
            .setLegacyStreamType(android.media.AudioManager.STREAM_RING)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        manager.createNotificationChannel(NotificationChannel(CALL_CHANNEL, "Appels entrants", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Appels vidéo entrants Konolive"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 900, 250, 900, 250, 900)
            setSound(ringtone, ringtoneAudio)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
        manager.createNotificationChannel(NotificationChannel(STATE_CHANNEL, "État des appels", NotificationManager.IMPORTANCE_LOW))
        val missedSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val missedAudio = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        manager.createNotificationChannel(NotificationChannel(MISSED_CHANNEL, "Appels manqués", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Notifications des appels entrants non répondus"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 250, 150, 250)
            setSound(missedSound, missedAudio)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
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
            .setOnlyAlertOnce(false)
            .setSilent(false)
            .setFullScreenIntent(fullScreen, true)
            .setContentIntent(PendingIntent.getActivity(context, call.callId.hashCode() + 3, siteIntent, flags))
            .setVibrate(longArrayOf(0, 900, 250, 900, 250, 900))
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setTimeoutAfter(60_000)
        if (Build.VERSION.SDK_INT >= 31) {
            val decline = PendingIntent.getActivity(context, call.callId.hashCode() + 1,
                Intent(context, IncomingCallActivity::class.java).apply {
                    putExtra(EXTRA_CALL_JSON, call.toJson().toString())
                    putExtra(EXTRA_ACTION, ACTION_REJECT)
                }, flags)
            val answer = PendingIntent.getActivity(context, call.callId.hashCode() + 2,
                Intent(context, IncomingCallActivity::class.java).apply {
                    putExtra(EXTRA_CALL_JSON, call.toJson().toString())
                    putExtra(EXTRA_ACTION, ACTION_ACCEPT)
                }, flags)
            builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(person, decline, answer))
        }
        val notification = builder.build().apply {
            this.flags = this.flags or Notification.FLAG_INSISTENT
        }
        NotificationManagerCompat.from(context).notify(INCOMING_ID, notification)
    }

    fun showMissed(context: Context, call: IncomingCall) {
        createChannels(context)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val openApp = PendingIntent.getActivity(
            context,
            call.callId.hashCode() + 11,
            Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
            flags,
        )
        val notification = NotificationCompat.Builder(context, MISSED_CHANNEL)
            .setSmallIcon(com.konolivepro.mobile.R.drawable.ic_konolive)
            .setContentTitle("Appel manqué")
            .setContentText("Vous avez manqué l’appel de ${call.callerName}")
            .setStyle(NotificationCompat.BigTextStyle().bigText("Vous avez manqué l’appel vidéo de ${call.callerName}."))
            .setCategory("missed_call")
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setContentIntent(openApp)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .build()
        val notificationId = MISSED_BASE_ID + (call.callId.hashCode() and 0x0FFF)
        NotificationManagerCompat.from(context).notify(notificationId, notification)
    }

    fun cancelIncoming(context: Context) {
        NotificationManagerCompat.from(context).cancel(INCOMING_ID)
    }

    const val EXTRA_CALL_JSON = "extra_call_json"
    const val EXTRA_ACTION = "extra_action"
    const val ACTION_ACCEPT = "accept"
    const val ACTION_REJECT = "reject"
}
