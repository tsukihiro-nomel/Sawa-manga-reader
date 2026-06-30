function waitForAnimationFrame(timeoutMs = 120) {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      resolve();
      return;
    }
    let settled = false;
    let frameId = null;
    let timerId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timerId !== null) clearTimeout(timerId);
      if (frameId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
      resolve();
    };
    frameId = requestAnimationFrame(finish);
    timerId = setTimeout(finish, timeoutMs);
  });
}

export async function waitForStableLayout() {
  await waitForAnimationFrame();
  await waitForAnimationFrame();
}

export function waitForTransitionPaint() {
  return waitForAnimationFrame();
}

export function createInterfaceTransitionCoordinator(options = {}) {
  const flushReaderSession = options.flushReaderSession || (() => Promise.resolve());
  const closeTransientUi = options.closeTransientUi || (() => {});
  const preloadKavita = options.preloadKavita || (() => Promise.resolve());
  const persistMode = options.persistMode || (() => Promise.resolve());
  const applyMode = options.applyMode || (() => {});
  const setTransition = options.setTransition || (() => {});
  const transitionPaint = options.waitForTransitionPaint || waitForTransitionPaint;
  const stableLayout = options.waitForStableLayout || waitForStableLayout;
  const reportError = options.reportError || (() => {});

  return {
    async request(nextMode, currentMode) {
      if (!nextMode || nextMode === currentMode) return true;
      setTransition(true);
      try {
        await transitionPaint();
        await flushReaderSession();
        closeTransientUi();
        if (nextMode === 'kavita') await preloadKavita();
        await persistMode(nextMode);
        applyMode(nextMode);
        await stableLayout();
        return true;
      } catch (error) {
        reportError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setTransition(false);
      }
    },
  };
}
