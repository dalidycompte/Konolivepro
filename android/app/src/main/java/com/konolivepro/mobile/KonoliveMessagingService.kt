package com.konolivepro.mobile

import android.content.Intent
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import org.json.JSONObject
import java.time.Instant

const val ACTION_CALL_STATE = "com.konolivepro.mobile.CALL_STATE"

class KonoliveMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        val store = SessionStore(this)
        store.accessToken ?: return
        sendBroadcast(Intent(ACTION_FCM_TOKEN).setPackage(packageName).putExtra(FCM_TOKEN, token))
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        when (data["type"]?.lowercase()) {
            "incoming_call" -> handleIncoming(data)
            "call_state" -> handleCallState(data)
        }
    }

    private fun handleIncoming(data: Map<String, String>) {
        val call = IncomingCall(
            callId = data[CALL_ID] ?: data["call_id"].orEmpty(),
            callerId = data[CALLER_ID] ?: data["caller_id"].orEmpty(),
            callerName = data[CALLER_NAME] ?: data["caller_name"] ?: "Agent Konolive",
            callerPhoto = data[CALLER_PHOTO] ?: data["caller_photo"].orEmpty(),
            receiverId = data[RECEIVER_ID] ?: data["receiver_id"].orEmpty(),
            requestId = data[REQUEST_ID] ?: data["request_id"].orEmpty(),
            callType = data[CALL_TYPE] ?: data["video"]?.let { if (it == "true") "video" else "audio" } ?: "video",
            timestamp = data[TIMESTAMP] ?: data["timestamp"].orEmpty(),
            expiresAt = data[EXPIRES_AT] ?: data["expires_at"].orEmpty(),
        )
        if (call.callId.isBlank() || isExpired(call.expiresAt)) return
        getSharedPreferences("konolive_pending_call", MODE_PRIVATE)
            .edit().putString("call", call.toJson().toString()).apply()
        ContextCompat.startForegroundService(this, Intent(this, CallForegroundService::class.java).apply {
            putExtra(CallForegroundService.EXTRA_MODE, CallForegroundService.MODE_INCOMING)
            putExtra(CallNotifications.EXTRA_CALL_JSON, call.toJson().toString())
        })
        // L’écran d’appel entrant unique est natif ; ne pas transmettre l’événement à la WebView,
        // afin d’éviter l’ouverture du second écran blanc.
        CallNotifications.showIncoming(this, call)
    }

    private fun handleCallState(data: Map<String, String>) {
        val callId = data[CALL_ID] ?: data["call_id"].orEmpty()
        if (callId.isBlank()) return
        val pending = getSharedPreferences("konolive_pending_call", MODE_PRIVATE)
        val rawPending = pending.getString("call", null)
        val pendingCallId = runCatching { rawPending?.let { JSONObject(it).optString(CALL_ID) } }.getOrNull()
        if (pendingCallId == callId) {
            val state = data[CALL_STATE] ?: data["call_state"].orEmpty()
            if (state.equals("EXPIRED", ignoreCase = true)) {
                runCatching { rawPending?.let { CallNotifications.showMissed(this, IncomingCall.fromJson(JSONObject(it))) } }
            }
            pending.edit().clear().apply()
            CallNotifications.cancelIncoming(this)
            CallForegroundService.stopIncoming(this)
        }
        sendBroadcast(Intent(ACTION_CALL_STATE).setPackage(packageName).apply {
            putExtra(CALL_ID, callId)
            putExtra(CALL_STATE, data[CALL_STATE] ?: data["call_state"].orEmpty())
        })
    }

    private fun isExpired(expiresAt: String): Boolean = runCatching {
        expiresAt.isNotBlank() && Instant.parse(expiresAt).isBefore(Instant.now())
    }.getOrDefault(false)
}
