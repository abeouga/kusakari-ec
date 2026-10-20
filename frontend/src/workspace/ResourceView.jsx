/** @param {{resource:ReturnType<import('./useResource').useResource>}} props */
export function ResourceStatus({ resource }) {
  return (
    <>
      {resource.error && (
        <p role="alert" className="error">
          {resource.error} <button onClick={() => void resource.reload()}>再取得</button>
        </p>
      )}
      {resource.notice && <p role="status">{resource.notice}</p>}
      {resource.data === null && !resource.error && <p role="status">読み込んでいます。</p>}
    </>
  );
}
/** @param {{label:string,name:string,value?:string,type?:string,required?:boolean,maxLength?:number}} props */
export function Input({ label, name, value = '', type = 'text', required = true, maxLength = 200 }) {
  return (
    <label>
      {label}
      <input name={name} type={type} defaultValue={value} required={required} maxLength={maxLength} />
    </label>
  );
}
/** @param {HTMLFormElement} form @returns {Record<string,string>} */
export function values(form) {
  return Object.fromEntries(
    [...new FormData(form)]
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, String(value)]),
  );
}
