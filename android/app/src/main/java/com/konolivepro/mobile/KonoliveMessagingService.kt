package com.konolivepro.mobile

import android.content.Intent
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
        when (data["type"]) {
            "INCOMING_CALL" -> handleIncoming(data)
            "CALL_STATE" -> handleCallState(data)
        }
    }

    private fun handleIncoming(data: Map<String, String>) {
        val call = IncomingCall(
            callId = data[CALL_ID].orEmpty(),
            callerId = data[CALLER_ID].orEmpty(),
            callerName = data[CALLER_NAME] ?: "Agent Konolive",
            callerPhoto = data[CALLER_PHOTO].orEmpty(),
            receiverId = data[RECEIVER_ID].orEmpty(),
            requestId = data[REQUEST_ID].orEmpty(),
            callType = data[CALL_TYPE] ?: "video",
            timestamp = data[TIMESTAMP].orEmpty(),
            expiresAt = data[EXPIRES_AT].orEmpty(),
        )
        if (call.callId.isBlank() || isExpired(call.expiresAt)) return
        getSharedPreferences("konolive_pending_call", MODE_PRIVATE)
            .edit().putString("call", call.toJson().toString()).apply()
        CallNotifications.showIncoming(this, call)
        sendBroadcast(Intent(ACTION_INCOMING_CALL).setPackage(packageName).putExtra(CALL_JSON, call.toJson().toString()))
    }

    private fun handleCallState(data: Map<String, String>) {
        val callId = data[CALL_ID].orEmpty()
        if (callId.isBlank()) return
        val pending = getSharedPreferences("konolive_pending_call", MODE_PRIVATE)
        val pendingCallId = runCatching { pending.getString("call", null)?.let { JSONObject(it).optString(CALL_ID) } }.getOrNull()
        if (pendingCallId == callId) {
            pending.edit().clear().apply()
            CallNotifications.cancelIncoming(this)
        }
        sendBroadcast(Intent(ACTION_CALL_STATE).setPackage(packageName).apply {
            putExtra(CALL_ID, callId)
            putExtra(CALL_STATE, data[CALL_STATE].orEmpty())
        })
    }

    private fun isExpired(expiresAt: String): Boolean = runCatching {
        expiresAt.isNotBlank() && Instant.parse(expiresAt).isBefore(Instant.now())
    }.getOrDefault(false)
}
