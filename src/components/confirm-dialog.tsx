'use client';

import { AlertDialog } from '@astryxdesign/core/AlertDialog';

/** Astryx provides focus trapping, Escape handling and safe initial cancel focus. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel();
      }}
      title={title}
      description={message ?? ''}
      cancelLabel={cancelLabel}
      actionLabel={confirmLabel}
      actionVariant={danger ? 'destructive' : 'primary'}
      onAction={onConfirm}
    />
  );
}
