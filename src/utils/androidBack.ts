/**
 * Android Hardware & Gesture Back Button Handler
 *
 * Maintains an in-memory stack of open modals and sheets.
 * When the Android hardware/gesture back button is pressed, the topmost
 * modal is closed without causing unmount loops or destructive history pops.
 */

type ModalCloseHandler = () => void;
const modalStack: { id: string; close: ModalCloseHandler }[] = [];

/**
 * Registers an active modal with the in-memory back handler.
 * Does NOT call window.history.pushState or window.history.back(),
 * preventing component re-renders from triggering spurious popstate events.
 */
export function registerModalBackHandler(id: string, onClose: ModalCloseHandler): () => void {
  const entry = { id, close: onClose };
  modalStack.push(entry);

  return () => {
    const idx = modalStack.indexOf(entry);
    if (idx !== -1) {
      modalStack.splice(idx, 1);
    }
  };
}

/**
 * Checks if any modal handled the back press.
 * Returns true if a modal was closed, false otherwise.
 */
export function popModalBackHandler(): boolean {
  if (modalStack.length > 0) {
    const top = modalStack.pop();
    if (top) {
      try {
        top.close();
      } catch (err) {
        console.error('Error closing modal on back:', err);
      }
      return true;
    }
  }
  return false;
}

export function isModalOpen(): boolean {
  return modalStack.length > 0;
}
