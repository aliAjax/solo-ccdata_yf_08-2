import React, { createContext, useCallback, useContext, useState } from 'react';

// ---------- Toast ----------
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = useCallback((text, tone = 'info') => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} data-testid="toast">
            <span className="toast-ico">{t.tone === 'error' ? '✕' : t.tone === 'success' ? '✓' : 'ℹ'}</span>
            <div>{t.text}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export function useToast() {
  return useContext(ToastCtx) || ((t) => console.log(t));
}

// ---------- Modal ----------
export function Modal({ title, sub, onClose, children, footer, wide }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <small>{sub}</small>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, text, confirmText = '确认', danger, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>取消</button>
        <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={() => { onConfirm(); onClose(); }}>{confirmText}</button>
      </>}>
      <p className="confirm-text">{text}</p>
    </Modal>
  );
}

// ---------- 状态徽章 ----------
const TONE_CLASS = { neutral: '', blue: 'badge-blue', amber: 'badge-amber', green: 'badge-green' };
export function StatusBadge({ status, overdue }) {
  const labels = { draft: '草稿', approved: '已批准', executing: '执行中', completed: '已完成' };
  const tones = { draft: '', approved: 'badge-blue', executing: 'badge-amber', completed: 'badge-green' };
  return (
    <span className="badge-wrap">
      <span className={`badge ${tones[status]}`} data-status={status}>{labels[status]}</span>
      {overdue && <span className="badge badge-red" data-testid="overdue-tag">逾期</span>}
    </span>
  );
}

// ---------- 表单小件 ----------
export function Field({ label, required, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}{required && <b>*</b>}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export const inputCls = 'inp';
