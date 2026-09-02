/*
  MemoCare two-servo pill dispenser firmware
  -------------------------------------------
  Target boards:
    - Arduino UNO R4 WiFi
    - UNO-compatible boards with a supported Servo library

  IMPORTANT POWER WARNING
  -----------------------
  Do NOT power two SG90 servos directly from the Arduino 5V pin under
  significant load. Servo startup and stall current can reset or damage the
  board. Use a suitable regulated external 5V supply for both servo red wires.
  Connect the external supply GND and Arduino GND together (common ground).
  Never reverse servo power polarity:
    - SG90 brown/black = GND
    - SG90 red         = regulated +5V
    - SG90 orange/yellow/white = signal

  Default wiring (change the constants below if needed):
    Rotation servo signal -> D9
    Flap servo signal     -> D10
    External 5V +         -> both servo red wires
    External 5V GND       -> both servo brown/black wires AND Arduino GND

  The web app sends newline-terminated commands at 115200 baud:
    PING, STATUS, HOME
    ROTATE:1 ... ROTATE:4
    DISPENSE:1 ... DISPENSE:4
    OPEN_FLAP, CLOSE_FLAP, STOP

  Safety behaviour:
    - The flap moves to FLAP_CLOSED_ANGLE during startup.
    - A dispense command is rejected while another movement is active.
    - The automatic flap cannot open until rotation reached the selected angle.
    - STOP immediately cancels the sequence and commands the flap closed.
    - No long delay() calls are used; movement is managed with millis().
*/

#include <Servo.h>

// ---------- Configurable pins ----------
constexpr uint8_t ROTATION_SERVO_PIN = 9;
constexpr uint8_t FLAP_SERVO_PIN = 10;

// ---------- Calibrate these angles for your mechanism ----------
constexpr uint8_t COMPARTMENT_COUNT = 4;
const uint8_t COMPARTMENT_ANGLES[COMPARTMENT_COUNT] = {12, 58, 104, 150};
constexpr uint8_t HOME_ANGLE = COMPARTMENT_ANGLES[0];
constexpr uint8_t FLAP_CLOSED_ANGLE = 10;
constexpr uint8_t FLAP_OPEN_ANGLE = 85;

// ---------- Timing and smooth movement ----------
constexpr unsigned long SERVO_STEP_INTERVAL_MS = 18;
constexpr uint8_t SERVO_STEP_DEGREES = 2;
constexpr unsigned long ALIGN_SETTLE_MS = 450;
constexpr unsigned long FLAP_OPEN_DURATION_MS = 1500;
constexpr unsigned long STARTUP_SETTLE_MS = 700;
constexpr size_t COMMAND_BUFFER_SIZE = 48;

Servo rotationServo;
Servo flapServo;

enum class DeviceState : uint8_t {
  STARTUP,
  IDLE,
  ROTATING,
  ALIGN_SETTLE,
  OPENING_FLAP,
  FLAP_HOLD,
  CLOSING_FLAP,
  STOPPING
};

enum class Operation : uint8_t {
  NONE,
  HOME,
  ROTATE_ONLY,
  DISPENSE,
  MANUAL_OPEN,
  MANUAL_CLOSE
};

DeviceState state = DeviceState::STARTUP;
Operation operation = Operation::NONE;

char commandBuffer[COMMAND_BUFFER_SIZE];
size_t commandLength = 0;

int rotationCurrentAngle = HOME_ANGLE;
int rotationTargetAngle = HOME_ANGLE;
int flapCurrentAngle = FLAP_CLOSED_ANGLE;
int flapTargetAngle = FLAP_CLOSED_ANGLE;
uint8_t selectedCompartment = 0;

unsigned long lastRotationStepAt = 0;
unsigned long lastFlapStepAt = 0;
unsigned long stateStartedAt = 0;
bool readySent = false;

const __FlashStringHelper* stateName(DeviceState value) {
  switch (value) {
    case DeviceState::STARTUP: return F("STARTUP");
    case DeviceState::IDLE: return F("IDLE");
    case DeviceState::ROTATING: return F("ROTATING");
    case DeviceState::ALIGN_SETTLE: return F("ALIGN_SETTLE");
    case DeviceState::OPENING_FLAP: return F("OPENING_FLAP");
    case DeviceState::FLAP_HOLD: return F("FLAP_HOLD");
    case DeviceState::CLOSING_FLAP: return F("CLOSING_FLAP");
    case DeviceState::STOPPING: return F("STOPPING");
  }
  return F("UNKNOWN");
}

void setState(DeviceState next) {
  state = next;
  stateStartedAt = millis();
}

bool isBusy() {
  return state != DeviceState::IDLE;
}

bool validCompartment(int value) {
  return value >= 1 && value <= COMPARTMENT_COUNT;
}

int moveToward(int currentAngle, int targetAngle, uint8_t stepDegrees) {
  if (currentAngle < targetAngle) {
    return min(currentAngle + stepDegrees, targetAngle);
  }
  if (currentAngle > targetAngle) {
    return max(currentAngle - stepDegrees, targetAngle);
  }
  return currentAngle;
}

bool updateRotationServo() {
  const unsigned long now = millis();
  if (now - lastRotationStepAt < SERVO_STEP_INTERVAL_MS) {
    return rotationCurrentAngle == rotationTargetAngle;
  }
  lastRotationStepAt = now;
  rotationCurrentAngle = moveToward(rotationCurrentAngle, rotationTargetAngle, SERVO_STEP_DEGREES);
  rotationServo.write(rotationCurrentAngle);
  return rotationCurrentAngle == rotationTargetAngle;
}

bool updateFlapServo() {
  const unsigned long now = millis();
  if (now - lastFlapStepAt < SERVO_STEP_INTERVAL_MS) {
    return flapCurrentAngle == flapTargetAngle;
  }
  lastFlapStepAt = now;
  flapCurrentAngle = moveToward(flapCurrentAngle, flapTargetAngle, SERVO_STEP_DEGREES);
  flapServo.write(flapCurrentAngle);
  return flapCurrentAngle == flapTargetAngle;
}

void sendReady() {
  Serial.println(F("READY"));
  readySent = true;
}

void finishOperation() {
  operation = Operation::NONE;
  selectedCompartment = 0;
  setState(DeviceState::IDLE);
  sendReady();
}

void reportStatus() {
  Serial.print(F("STATUS:"));
  Serial.print(stateName(state));
  Serial.print(F(",ROTATION="));
  Serial.print(rotationCurrentAngle);
  Serial.print(F(",FLAP="));
  Serial.print(flapCurrentAngle);
  if (selectedCompartment > 0) {
    Serial.print(F(",COMPARTMENT="));
    Serial.print(selectedCompartment);
  }
  Serial.println();
}

void beginRotation(uint8_t compartment, Operation requestedOperation) {
  selectedCompartment = compartment;
  operation = requestedOperation;
  rotationTargetAngle = COMPARTMENT_ANGLES[compartment - 1];
  Serial.print(F("ROTATING:"));
  Serial.println(compartment);
  setState(DeviceState::ROTATING);
}

void beginManualFlap(bool open) {
  operation = open ? Operation::MANUAL_OPEN : Operation::MANUAL_CLOSE;
  flapTargetAngle = open ? FLAP_OPEN_ANGLE : FLAP_CLOSED_ANGLE;
  setState(open ? DeviceState::OPENING_FLAP : DeviceState::CLOSING_FLAP);
}

void emergencyStop() {
  operation = Operation::NONE;
  selectedCompartment = 0;
  flapTargetAngle = FLAP_CLOSED_ANGLE;
  Serial.println(F("ERROR:STOPPED"));
  setState(DeviceState::STOPPING);
}

void rejectIfBusy() {
  Serial.println(F("BUSY"));
}

int parseCompartment(const char* command, const char* prefix) {
  const size_t prefixLength = strlen(prefix);
  if (strncmp(command, prefix, prefixLength) != 0) {
    return -1;
  }
  return atoi(command + prefixLength);
}

void processCommand(char* command) {
  // Trim leading/trailing spaces and normalize ASCII letters.
  while (*command == ' ' || *command == '\t') command++;
  size_t length = strlen(command);
  while (length > 0 && (command[length - 1] == ' ' || command[length - 1] == '\t' || command[length - 1] == '\r')) {
    command[--length] = '\0';
  }
  for (size_t index = 0; index < length; index++) {
    if (command[index] >= 'a' && command[index] <= 'z') {
      command[index] = command[index] - 'a' + 'A';
    }
  }

  if (length == 0) return;

  if (strcmp(command, "STOP") == 0) {
    emergencyStop();
    return;
  }
  if (strcmp(command, "PING") == 0) {
    if (isBusy()) Serial.println(F("BUSY"));
    else sendReady();
    return;
  }
  if (strcmp(command, "STATUS") == 0) {
    reportStatus();
    return;
  }
  if (isBusy()) {
    rejectIfBusy();
    return;
  }
  if (strcmp(command, "HOME") == 0) {
    operation = Operation::HOME;
    selectedCompartment = 1;
    rotationTargetAngle = HOME_ANGLE;
    Serial.println(F("ROTATING:1"));
    setState(DeviceState::ROTATING);
    return;
  }
  if (strcmp(command, "OPEN_FLAP") == 0) {
    beginManualFlap(true);
    return;
  }
  if (strcmp(command, "CLOSE_FLAP") == 0) {
    beginManualFlap(false);
    return;
  }

  int compartment = parseCompartment(command, "ROTATE:");
  if (compartment != -1) {
    if (!validCompartment(compartment)) {
      Serial.println(F("ERROR:INVALID_COMPARTMENT"));
      return;
    }
    beginRotation(static_cast<uint8_t>(compartment), Operation::ROTATE_ONLY);
    return;
  }

  compartment = parseCompartment(command, "DISPENSE:");
  if (compartment != -1) {
    if (!validCompartment(compartment)) {
      Serial.println(F("ERROR:INVALID_COMPARTMENT"));
      return;
    }
    // Automatic dispense always begins with tray rotation. The flap remains
    // closed until ROTATING and ALIGN_SETTLE have completed.
    flapTargetAngle = FLAP_CLOSED_ANGLE;
    beginRotation(static_cast<uint8_t>(compartment), Operation::DISPENSE);
    return;
  }

  Serial.println(F("ERROR:UNKNOWN_COMMAND"));
}

void readSerialCommands() {
  while (Serial.available() > 0) {
    const char incoming = static_cast<char>(Serial.read());
    if (incoming == '\n') {
      commandBuffer[commandLength] = '\0';
      processCommand(commandBuffer);
      commandLength = 0;
      continue;
    }
    if (incoming == '\r') continue;
    if (commandLength < COMMAND_BUFFER_SIZE - 1) {
      commandBuffer[commandLength++] = incoming;
    } else {
      commandLength = 0;
      Serial.println(F("ERROR:COMMAND_TOO_LONG"));
    }
  }
}

void updateStateMachine() {
  const unsigned long now = millis();

  switch (state) {
    case DeviceState::STARTUP:
      updateRotationServo();
      updateFlapServo();
      if (now - stateStartedAt >= STARTUP_SETTLE_MS &&
          rotationCurrentAngle == rotationTargetAngle &&
          flapCurrentAngle == FLAP_CLOSED_ANGLE) {
        finishOperation();
      }
      break;

    case DeviceState::IDLE:
      break;

    case DeviceState::ROTATING:
      if (updateRotationServo()) {
        Serial.print(F("ALIGNED:"));
        Serial.println(selectedCompartment);
        setState(DeviceState::ALIGN_SETTLE);
      }
      break;

    case DeviceState::ALIGN_SETTLE:
      if (now - stateStartedAt < ALIGN_SETTLE_MS) break;
      if (operation == Operation::DISPENSE) {
        // This is the only automatic transition that opens the flap. It is
        // reachable only after ALIGNED was emitted for the selected tray.
        flapTargetAngle = FLAP_OPEN_ANGLE;
        setState(DeviceState::OPENING_FLAP);
      } else {
        finishOperation();
      }
      break;

    case DeviceState::OPENING_FLAP:
      if (updateFlapServo()) {
        Serial.println(F("FLAP_OPEN"));
        if (operation == Operation::DISPENSE) {
          setState(DeviceState::FLAP_HOLD);
        } else {
          finishOperation();
        }
      }
      break;

    case DeviceState::FLAP_HOLD:
      if (now - stateStartedAt >= FLAP_OPEN_DURATION_MS) {
        flapTargetAngle = FLAP_CLOSED_ANGLE;
        setState(DeviceState::CLOSING_FLAP);
      }
      break;

    case DeviceState::CLOSING_FLAP:
      if (updateFlapServo()) {
        Serial.println(F("FLAP_CLOSED"));
        if (operation == Operation::DISPENSE) {
          Serial.print(F("DISPENSED:"));
          Serial.println(selectedCompartment);
        }
        finishOperation();
      }
      break;

    case DeviceState::STOPPING:
      if (updateFlapServo()) {
        Serial.println(F("FLAP_CLOSED"));
        finishOperation();
      }
      break;
  }
}

void setup() {
  Serial.begin(115200);

  rotationServo.attach(ROTATION_SERVO_PIN);
  flapServo.attach(FLAP_SERVO_PIN);

  // Set safe targets once. Do not repeatedly attach or write large angle
  // changes after a browser reconnect.
  rotationCurrentAngle = HOME_ANGLE;
  rotationTargetAngle = HOME_ANGLE;
  flapCurrentAngle = FLAP_CLOSED_ANGLE;
  flapTargetAngle = FLAP_CLOSED_ANGLE;
  rotationServo.write(rotationCurrentAngle);
  flapServo.write(flapCurrentAngle);
  stateStartedAt = millis();
}

void loop() {
  readSerialCommands();
  updateStateMachine();
}
