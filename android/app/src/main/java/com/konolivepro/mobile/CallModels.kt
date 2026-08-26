package com.konolivepro.mobile

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

const val CALL_ID = "callId"
const val CALLER_ID = "callerId"
const val CALLER_NAME = "callerName"
const val CALLER_PHOTO = "callerPhoto"
const val RECEIVER_ID = "receiverId"
const val REQUEST_ID = "requestId"
const val CALL_TYPE = "callType"
const val TIMESTAMP = "timestamp"
const val EXPIRES_AT = "expiresAt"
const val CALL_STATE = "state"

private const val PREFS = "konolive_session"

class SessionStore(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    var accessToken: String?
        get() = prefs.getString("access_token", null)
        set(value) = prefs.edit().putString("access_token", value).apply()

    var userId: String?
        get() = prefs.getString("user_id", null)
        set(value) = prefs.edit().putString("user_id", value).apply()

    var username: String?
        get() = prefs.getString("username", null)
        set(value) = prefs.edit().putString("username", value).apply()

    val deviceId: String
        get() = prefs.getString("device_id", null) ?: run {
            val value = java.util.UUID.randomUUID().toString()
            prefs.edit().putString("device_id", value).apply()
            value
        }

    fun clear() = prefs.edit().clear().apply()
}

data class IncomingCall(
    val callId: String,
    val callerId: String,
    val callerName: String,
    val callerPhoto: String,
    val receiverId: String,
    val requestId: String,
    val callType: String,
    val timestamp: String,
    val expiresAt: String,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put(CALL_ID, callId)
        put(CALLER_ID, callerId)
        put(CALLER_NAME, callerName)
        put(CALLER_PHOTO, callerPhoto)
        put(RECEIVER_ID, receiverId)
        put(REQUEST_ID, requestId)
        put(CALL_TYPE, callType)
        put(TIMESTAMP, timestamp)
        put(EXPIRES_AT, expiresAt)
    }

    companion object {
        fun fromJson(json: JSONObject): IncomingCall = IncomingCall(
            callId = json.optString(CALL_ID),
            callerId = json.optString(CALLER_ID),
            callerName = json.optString(CALLER_NAME, "Agent Konolive"),
            callerPhoto = json.optString(CALLER_PHOTO),
            receiverId = json.optString(RECEIVER_ID),
            requestId = json.optString(REQUEST_ID),
            callType = json.optString(CALL_TYPE, "video"),
            timestamp = json.optString(TIMESTAMP),
            expiresAt = json.optString(EXPIRES_AT),
        )
    }
}
