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
};

/** @param {Person} person */
const who = (person) =>
  person.name && person.name !== person.email ? `${person.name}（${person.email}）` : person.email;

/**
 * Issue #180: who assigned, removed, expelled or reinstated whom, and when (#170). Expulsions and reinstatements cover
 * the whole organization; assignments and removals cover the chosen store, since the owner and ORG_ADMIN switch stores.
 * @param {{storeId:number,storeName:string}} props
 */
export function MemberEventsPage({ storeId, storeName }) {
  const resource = useResource(`/seller/stores/${storeId}/member-events`);
  const events = /** @type {MemberEvent[]|null} */ (resource.data);
  return (
    <section className="workspace-card">
      <ResourceStatus resource={resource} />
      <p className="muted">
        組織からの除名と復帰は組織の全員の分を、店舗の担当にした・外した操作は{storeName}
        の分を、新しい順に表示しています。
      </p>
      {events && events.length === 0 && <p>まだ記録はありません。</p>}
      {events && events.length > 0 && (
        <DataTable
          headers={['日時', '操作', '操作した人', '操作された人', '店舗']}
          rows={events.map((event) => [
            new Date(event.createdAt).toLocaleString('ja-JP'),
            eventLabels[event.eventType] ?? event.eventType,
            who(event.actor),
            who(event.target),
            event.storeId === null ? '（組織）' : storeName,
          ])}
        />
      )}
    </section>
  );
}
