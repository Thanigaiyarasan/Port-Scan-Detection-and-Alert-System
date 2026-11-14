const STATES = Object.freeze(['Q0', 'Q1', 'Q2', 'Q3', 'Q4']);
const WINDOW_MS = 10_000;

export class DfaDetection {
  constructor({ windowMs = WINDOW_MS } = {}) {
    this.windowMs = windowMs;
    this.sources = new Map();
  }

  process({ sourceIp, destinationPort, timestamp = new Date() }) {
    const time = new Date(timestamp);
    let context = this.sources.get(sourceIp);
    const transitions = [];

    if (context && time.getTime() - context.windowStartedAt >= this.windowMs) {
      transitions.push(this.transition(context, 'connection_timeout', 'Q0', time));
      context = null;
    }

    if (!context) {
      context = { state: 'Q0', ports: new Set(), orderedPorts: [], windowStartedAt: time.getTime(), attempts: 0 };
      this.sources.set(sourceIp, context);
    }

    const repeated = context.ports.has(destinationPort);
    context.attempts += 1;
    if (!repeated) {
      context.ports.add(destinationPort);
      context.orderedPorts.push(destinationPort);
    }

    let nextState = context.state;
    if (!repeated) {
      const distinctPorts = context.ports.size;
      if (distinctPorts >= 10) nextState = 'Q4';
      else if (distinctPorts >= 5) nextState = 'Q3';
      else if (distinctPorts >= 2) nextState = 'Q2';
      else nextState = 'Q1';
    }
    transitions.push(this.transition(context, repeated ? 'repeated_port' : 'new_port', nextState, time));

    const scanDetected = context.state === 'Q3' || context.state === 'Q4';
    const rapidAttempts = context.attempts >= 10 && time.getTime() - context.windowStartedAt <= 1000;
    const rapidAttemptNow = context.attempts === 10 && rapidAttempts;
    const sequential = context.orderedPorts.length >= 5 &&
      context.orderedPorts.every((port, index, list) => index === 0 || port > list[index - 1]);
    const pattern = sequential ? 'sequential' : 'multiple';
    return {
      state: context.state,
      transitions,
      distinctPorts: [...context.ports],
      attempts: context.attempts,
      scanDetected,
      confirmed: context.state === 'Q4',
      rapidAttempts,
      rapidAttemptNow,
      pattern,
      attackType: scanDetected ? `${sequential ? 'Sequential' : 'Multiple'} port scan${context.state === 'Q4' ? ' confirmed' : ''}` : rapidAttempts ? 'Rapid connection attempts' : null,
      severity: context.state === 'Q4' ? 'CRITICAL' : scanDetected ? 'HIGH' : rapidAttempts ? 'MEDIUM' : 'LOW'
    };
  }

  transition(context, inputSymbol, currentState, timestamp) {
    const transition = {
      previousState: context.state,
      inputSymbol,
      currentState,
      timestamp
    };
    context.state = currentState;
    return transition;
  }

  getState(sourceIp) {
    return this.sources.get(sourceIp)?.state ?? 'Q0';
  }

  clear() {
    this.sources.clear();
  }
}

export { STATES, WINDOW_MS };
