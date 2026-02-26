/**
 * Shelly 1 Gen 3 - Contactor Monitoring Script
 *
 * Monitors if a contactor switches correctly when the Shelly output is triggered.
 * The contactor's auxiliary contact is connected to the Shelly input.
 *
 * Features:
 * - Monitors if contactor follows switch commands within timeout
 * - Alerts via MQTT if contactor fails to switch
 * - Auto-shutoff if contactor doesn't engage when switched ON
 * - Warning if contactor switches without command (manual operation)
 * - Success confirmation when contactor operates correctly
 */

let CONFIG = {
    /**
     * ID of the input that will be used as feedback loop to monitor if the switching operation was successful.
     * (note: this input would be changed to detached!)
     */
    'INPUT_ID': 0,
    /**
     * ID of the Switch that performs the switch operation to be monitored.
     */
    'SWITCH_ID': 0,
    /**
     * Configures the grace period (ms) until the input must be in the desired state before raising an alert.
     * This is the time to wait for the contactor to switch
     */
    'GRACE_PERIOD_MS': 3000,
    /**
     * MQTT topic for status messages
     */
    'mqttTopic': "monitor",
    /**
     * Enable debug logging
     */
    'DEBUG': true
};

let desiredInputState = null;
let currentTimer = null;
let mqttTopicPrefix = "";

/**
 * Clear any active monitoring timer
 */
let clearTimer = function() {
    if (currentTimer !== null) {
        Timer.clear(currentTimer);
    }
    currentTimer = null;
};

/**
 * Publishes an MQTT message
 */
let publishMQTT = function(topic, message) {
    if (!MQTT.isConnected()) {
        if (CONFIG.DEBUG) {
            print("MQTT is not connected");
        }
        return;
    }
    let fullTopic = mqttTopicPrefix + "/" + CONFIG.mqttTopic + "/" + topic;
    MQTT.publish(fullTopic, JSON.stringify(message), 0, false);

    if (CONFIG.DEBUG) {
        print("MQTT:", fullTopic, "->", JSON.stringify(message));
    }
}

/**
 * Send success message
 */
let sendSuccess = function(switchState) {
    publishMQTT("status", {
        type: "success",
        message: "Contactor switched correctly",
        switchState: switchState,
        inputState: switchState,
        timestamp: Date.now()
    });
}

/**
 * Send warning message
 */
let sendWarning = function(switchState, inputState) {
    publishMQTT("warning", {
        type: "warning",
        message: "Input changed without switch command",
        switchState: switchState,
        inputState: inputState,
        timestamp: Date.now()
    });
}

/**
 * Send alert message
 */
let sendAlert = function(switchState, inputState) {
    publishMQTT("alert", {
        type: "alert",
        message: "Input did not switch within " + CONFIG.GRACE_PERIOD_MS + "ms",
        switchState: switchState,
        inputState: inputState,
        timestamp: Date.now()
    });
}

/**
 * Send alert message
 */
let sendSafetyShutoff = function() {
    publishMQTT("status", {
        type: "safety_shutoff",
        message: "Switch turned OFF - input did not engage",
        switchState: false,
        inputState: false,
        timestamp: Date.now()
    });
}

/**
 * Handle switch state changes
 */
let handleSwitchStatusEvent = function(switchState) {
    if (CONFIG.DEBUG) {
        print("Switch changed to ", switchState);
    }
    clearTimer();
    desiredInputState = switchState;
    currentTimer = Timer.set(CONFIG.GRACE_PERIOD_MS, false, function() {
        if (CONFIG.DEBUG) {
            print("Timeout: Input did not switch in time");
        }
        Shelly.call("Input.GetStatus", {'id': CONFIG.INPUT_ID}, function(res) {
            if (res.state !== desiredInputState) {
                if (CONFIG.DEBUG) {
                    print("Alert - Input not in desired state");
                }
                sendAlert(desiredInputState, res.state);

                if (desiredInputState) {
                    // Security stop. If switch is turned on but Input is still of: Set Switch to off
                    if (CONFIG.DEBUG) {
                        print("Safety shutoff: Turning switch OFF since Input did not switch within time");
                    }
                    Shelly.call("Switch.set", {'id': CONFIG.SWITCH_ID, 'on': false});
                    sendSafetyShutoff();
                }
            }
        });
        }
    );
};

/**
 * Handle input state changes
 */
let handleInputStatusEvent = function(inputState) {
    if (CONFIG.DEBUG) {
        print("Input changed to ", inputState);
    }

    if (inputState === desiredInputState) {
        // all good. Desired state reached
        if (CONFIG.DEBUG) {
            print("Success - Input switched to expected state: ", inputState);
        }
        clearTimer();
        sendSuccess(inputState);
    } else {
        // Input has changed without switch state change. Most likely due to a manual operation
        if (CONFIG.DEBUG) {
            print("Warning - Input changed without switch command");
        }
        sendWarning(desiredInputState, inputState);
    }
};

/**
 * Setup the monitoring script
 */
let setup = function() {
    Shelly.call(
        "switch.setconfig",
        {id: CONFIG.INPUT_ID, config: {in_mode: "detached"}},
        function() {
            // get the initial switch state
            Shelly.call("Switch.GetStatus", {'id': CONFIG.SWITCH_ID}, function(res) {
                handleSwitchStatusEvent(res.output);
            });

            // retrieve MQTT topic prefix
            Shelly.call("MQTT.GetConfig", null, function(mqttConf) {
                mqttTopicPrefix = mqttConf.topic_prefix || "";
            });

            Shelly.addStatusHandler(function(event) {
                if (event.name === "switch" && event.id === CONFIG.SWITCH_ID && typeof event.delta.output !== "undefined") {
                    handleSwitchStatusEvent(event.delta.output);
                }
            });

            Shelly.addStatusHandler(function(event) {
                if (event.name === "input" && event.id === CONFIG.INPUT_ID) {
                    handleInputStatusEvent(event.delta.state);
                }
            });
        }
    );
};

setup();