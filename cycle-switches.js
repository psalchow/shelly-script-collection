/**
 * Script to cycle through different switch states of the local switch and a remote switch.
 * Cycle order:
 *   - Local: 0, Remote: 0
 *   - Local: 1, Remote: 0
 *   - Local: 1, Remote: 1
 *   - Local: 0, Remote: 1
 *   - Local: 1, Remote: 0
 *   ...
 * The cycle is broken if the configured input is in 'off' state for a certain time.
 */
let CONFIG = {
    /**
     * Pick your desired Input to be used for triggering the cycling (note: this input would be changed
     * to detached!)
     */
    'INPUT_ID': 0,
    /**
     * The Switch that should be used during cycling 
     */
    'SWITCH_ID': 0,
    /**
     * The URL of the remote Switch that should be used during cycling
     */
    'REMOTE_SWITCH_URL': 'http://shelly-24-stehlampe/relay/0',
    /**
     * Configures the delay that breaks the cycle 
     */
    'CYCLE_TIMEOUT': 300
};

let currentCycle = 0;
let currentTimer = null;

let switchLocal = function(onOff) {
  Shelly.call("switch.set", {id: CONFIG.SWITCH_ID, on: onOff});
};

let switchRemote = function(onOff) {
  Shelly.call(
    "HTTP.GET",
    {url: CONFIG.REMOTE_SWITCH_URL + "?turn=" + (onOff ? "on" : "off")}
  );
};

let resetTimer = function() {
  Timer.clear(currentTimer);
  currentTimer = Timer.set(CONFIG.CYCLE_TIMEOUT, false, function() {
      switchRemote(false);
      switchLocal(false);
      currentCycle = 0;
    }, null
  );
};

let clearTimer = function() {
  Timer.clear(currentTimer);
};

let handleSwitchEvent = function(event) {
  if (event.info.state === false) {
    resetTimer();
  }
    
  if (event.info.state === true) {
    clearTimer();
    if (currentCycle === 0) {
      switchLocal(true);
      currentCycle++;
    } else if (currentCycle === 1) {
      switchRemote(true);
      currentCycle++;
    } else if (currentCycle === 2) {
      switchLocal(false);
      currentCycle++;
    } else if (currentCycle === 3) {
      switchLocal(true);
      switchRemote(false);
      currentCycle = 1;
    }
  }
};

let setup = function() {
  Shelly.call(
    "switch.setconfig",
    {id: CONFIG.INPUT_ID, config: {in_mode: "detached"}},
    function() {
      Shelly.addEventHandler(function(event) {
        if (event.name === "input" && event.id === CONFIG.INPUT_ID && event.info.event === 'toggle') {
          handleSwitchEvent(event);
        }
      }, null);
    }
  );
};

setup();
