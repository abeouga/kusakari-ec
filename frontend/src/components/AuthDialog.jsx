import { Dialog } from './Dialog';
import { AuthPanel } from './AuthPanel';
import '../css/auth-dialog.css';

/** @param {{onClose:()=>void}} props */
export function AuthDialog({ onClose }) {
  return <Dialog title="ログイン・アカウント作成" onClose={onClose}><AuthPanel /></Dialog>;
}