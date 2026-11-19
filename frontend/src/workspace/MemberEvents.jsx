import { useResource } from './useResource';
import { ResourceStatus } from './ResourceView';
import { DataTable } from './Common';

/**
 * @typedef {{memberId:string,name:string,email:string}} Person
 * @typedef {{id:number,eventType:string,actor:Person,target:Person,storeId:number|null,createdAt:string}} MemberEvent
 */

/** @type {Record<string,string>} */
const eventLabels = {
  ASSIGN_TO_STORE: '店舗の担当にした',
  REMOVE_FROM_STORE: '店舗の担当から外した',
  EXPEL_FROM_ORGANIZATION: '組織から除名した',
  REINSTATE_TO_ORGANIZATION: '組織に復帰させた',
  OWNER_SUCCESSION_REQUEST: 'オーナーの譲渡を申し出た',
  OWNER_SUCCESSION_CANCELLATION: 'オーナーの譲渡の申し出を取り消した',
  OWNER_SUCCESSION_REFUSAL: 'オーナーの譲渡の申し出を断った',
  OWNER_SUCCESSION_APPROVAL: 'オーナーの譲渡を承認した（オーナーが交代）',
  OWNER_SUCCESSION_AUTO_INVALIDATED: 'オーナーの譲渡の申し出が自動で無効になった',
};

/**
 * Issue #213: an automatic invalidation (deadline passed, a party expelled, stopped or withdrawn) is nobody's operation.
 * Its record names the owner who made the request as the actor (#196 の 6), so the page shows no operator and names
 * that owner as the one who made the request instead.
 * @param {MemberEvent} event
 * @returns {[import('react').ReactNode, string]} the operation and the operator
 */
function operation(event) {
  const label = eventLabels[event.eventType] ?? event.eventType;
  if (event.eventType !== 'OWNER_SUCCESSION_AUTO_INVALIDATED') return [label, who(event.actor)];
  return [
    <>
      {label}
      <br />
      <span className="muted">申し出たオーナー：{who(event.actor)}</span>
    </>,
    'なし（自動）',
  ];
}

/** @param {Person} person */
const who = (person) =>
  person.name && person.name !== person.email ? `${person.name}（${person.email}）` : person.email;

/**
 * Issue #180: who assigned, removed, expelled or reinstated whom, and when (#170). Expulsions, reinstatements and owner
 * successions (#213) cover the whole organization; assignments and removals cover the chosen store, since the owner
 * and ORG_ADMIN switch stores.
 * @param {{storeId:number,storeName:string}} props
 */
export function MemberEventsPage({ storeId, storeName }) {
  const resource = useResource(`/seller/stores/${storeId}/member-events`);
  const events = /** @type {MemberEvent[]|null} */ (resource.data);
  return (
    <section className="workspace-card">
      <ResourceStatus resource={resource} />
      <p className="muted">
        組織からの除名と復帰、オーナーの譲渡は組織の全体の分を、店舗の担当にした・外した操作は{storeName}
        の分を、新しい順に表示しています。
      </p>
      {events && events.length === 0 && <p>まだ記録はありません。</p>}
      {events && events.length > 0 && (
        <DataTable
          headers={['日時', '操作', '操作した人', '操作された人', '店舗']}
          rows={events.map((event) => [
            new Date(event.createdAt).toLocaleString('ja-JP'),
            ...operation(event),
            who(event.target),
            event.storeId === null ? '（組織）' : storeName,
          ])}
        />
      )}
    </section>
  );
}
