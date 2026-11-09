/**
 * Shelly Gen 3/4 with Sensor Add-On - Sensor Heartbeat Script
 *
 * Re-publishes the status of the Add-On's temperature and humidity components
 * at a fixed interval, on the same topics the device's own status
 * notifications use (<topic_prefix>/status/temperature:100 and
 * <topic_prefix>/status/humidity:100).
 *
 * Why: the device only publishes a component's status when its value moves
 * past the report threshold. In very stable weather that can take hours, and a
 * consumer that judges freshness by the age of the last message then takes a
 * working sensor for a silent one. The heartbeat gives such a consumer a
 * message at least every INTERVAL_MS while the device and the sensor are fine.
 *
 * What it does not hide: the status is published as the device reports it. A
 * failed sensor reports tC/rh as null (with an "errors" entry), so a consumer
 * that only accepts numbers still sees the sensor go silent.
 *
 * Note: the heartbeat is published even if the device's own status
 * notifications (MQTT "status_ntf") are disabled. In that case these topics
 * carry only the heartbeat messages.
 */

let CONFIG = {
    /**
     * Interval between two heartbeats (ms). Keep it well below the age after
     * which the consumer treats the sensor as offline.
     */
    'INTERVAL_MS': 10 * 60 * 1000,
    /**
     * Components whose status is re-published, as "<type>:<id>".
     */
    'COMPONENTS': ["temperature:100", "humidity:100"],
    /**
     * Enable debug logging
     */
    'DEBUG': false
};

/**
 * Publishes the current status of one component on its status topic.
 */
let publishStatus = function(topicPrefix, key) {
    let status = Shelly.getComponentStatus(key);
    if (status === null || typeof status === "undefined") {
        if (CONFIG.DEBUG) {
            print("No such component:", key);
        }
        return;
    }
    let topic = topicPrefix + "/status/" + key;
    // Not retained: a retained copy would be delivered again on every
    // reconnect of a consumer and read as a fresh measurement.
    MQTT.publish(topic, JSON.stringify(status), 0, false);

    if (CONFIG.DEBUG) {
        print("MQTT:", topic, "->", JSON.stringify(status));
    }
};

/**
 * Publishes every configured component, if the broker is reachable.
 */
let heartbeat = function() {
    if (!MQTT.isConnected()) {
        if (CONFIG.DEBUG) {
            print("MQTT is not connected");
        }
        return;
    }
    let topicPrefix = Shelly.getComponentConfig("mqtt").topic_prefix || Shelly.getDeviceInfo().id;
    for (let i = 0; i < CONFIG.COMPONENTS.length; i++) {
        publishStatus(topicPrefix, CONFIG.COMPONENTS[i]);
    }
};

// Publish right away on (re)connect, so a consumer does not wait a full
// interval after a reboot or a broker outage.
MQTT.setConnectHandler(heartbeat);
Timer.set(CONFIG.INTERVAL_MS, true, heartbeat);
// The connect handler does not fire if MQTT was already connected when the
// script started.
heartbeat();
