import { navigate } from './navigation';

/** @param {{href:string,children:import('react').ReactNode,className?:string}} props */
export function PageLink({ href, children, className = '' }) {
  /** @param {import('react').MouseEvent<HTMLAnchorElement>} event */
  function follow(event) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }
  return (
    <a className={className} href={href} onClick={follow}>
      {children}
    </a>
  );
}

/** @param {{label:string,name:string,value?:string|number,type?:string,required?:boolean}} props */
export function Field({ label, name, value = '', type = 'text', required = true }) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value} required={required} maxLength={250} />
    </label>
  );
}

/** @param {{headers:string[],rows:import('react').ReactNode[][]}} props */
export function DataTable({ headers, rows }) {
  return (
    <div className="workspace-table-scroll">
      <table className="workspace-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, col) => (
                <td key={col}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="workspace-empty">該当するデータはありません。</p>}
    </div>
  );
}

/** @param {FormData} data @param {string} name */
export function text(data, name) {
  return String(data.get(name) || '').trim();
}

/** @param {{children:import('react').ReactNode}} props */
export function MockNote({ children }) {
  return (
    <p className="mock-note">
      <strong>画面モック</strong> {children} 再読み込みで初期化されます。
    </p>
  );
}
