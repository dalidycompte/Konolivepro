package com.konolivepro.mobile

import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger

class RealtimeClient(
    private val api: SupabaseApi,
    private val accessToken: String?,
) {
    private val client = OkHttpClient()
    private val refs = AtomicInteger(0)
    private var socket: WebSocket? = null
    private var topic: String? = null
    private var eventHandler: ((String, JSONObject) -> Unit)? = null
    private var readyHandler: (() -> Unit)? = null

    fun connect(channelName: String, handler: (String, JSONObject) -> Unit, onReady: () -> Unit = {}) {
        topic = "realtime:$channelName"
        eventHandler = handler
        readyHandler = onReady
        val request = Request.Builder().url(api.realtimeWebSocketUrl()).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                val join = JSONObject()
                    .put("topic", topic)
                    .put("event", "phx_join")
                    .put("ref", refs.incrementAndGet().toString())
                    .put("payload", JSONObject()
                        .put("access_token", accessToken ?: "")
                        .put("config", JSONObject().put("broadcast", JSONObject().put("self", false))))
                webSocket.send(join.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val message = JSONObject(text)
                    when (message.optString("event")) {
                        "phx_reply" -> if (message.optJSONObject("payload")?.optString("status") == "ok") readyHandler?.invoke()
                        "broadcast" -> {
                            val payload = message.optJSONObject("payload") ?: return
                            eventHandler?.invoke(payload.optString("event"), payload.optJSONObject("payload") ?: JSONObject())
                        }
                    }
                } catch (error: Exception) {
                    Log.w("KonoliveRealtime", "Message ignoré", error)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                Log.w("KonoliveRealtime", "Realtime indisponible", t)
            }
        })
    }

    fun sendBroadcast(event: String, payload: JSONObject) {
        val json = JSONObject()
            .put("topic", topic)
            .put("event", "broadcast")
            .put("ref", refs.incrementAndGet().toString())
            .put("payload", JSONObject().put("event", event).put("payload", payload))
        socket?.send(json.toString())
    }

    fun close() {
        socket?.close(1000, "call finished")
        socket = null
        eventHandler = null
        readyHandler = null
    }
}
