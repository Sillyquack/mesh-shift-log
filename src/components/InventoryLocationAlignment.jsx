import {
  EXPRESS_SHELF_STANDARD,
  MAIN_STORAGE_ORIENTATION,
  MAIN_STORAGE_ZONES,
  PLANETA_INITIAL_SCOPE_DEFERRAL,
  WORKBAR_MILK_FRIDGE_WINES,
  deriveLocationAlignment,
} from '../data/inventoryLocationAlignment.js';

function Status({ children, tone = '' }) {
  return <span className={`inventory-status ${tone}`.trim()}>{children}</span>;
}

export function InventoryLocationAlignmentManager({ data, onOpenStandards, onOpenGuidance }) {
  const alignment = deriveLocationAlignment(data);
  const expressImageStatus = alignment.expressGuidance?.objectPath
    ? 'Current manager image available.'
    : EXPRESS_SHELF_STANDARD.imageStatus;
  return (
    <div className="inventory-stack inventory-location-alignment">
      <section className="inventory-panel">
        <p className="eyebrow">Physical flow</p>
        <h2>Main Storage Fridge</h2>
        <p>{MAIN_STORAGE_ORIENTATION}</p>
        <div className="inventory-summary-grid">
          {MAIN_STORAGE_ZONES.map((zone) => (
            <div key={zone.key}>
              <strong>{zone.name}</strong>
              <span>{zone.position}</span>
            </div>
          ))}
        </div>
        <p className="inventory-policy-note">All three zones remain one combined Main Storage Fridge Stock Count. Express Shelf is not a separate count assignment.</p>
      </section>

      <section className="inventory-panel">
        <div className="inventory-panel-heading">
          <div><p className="eyebrow">Middle zone</p><h2>Express Shelf</h2></div>
          <Status tone={alignment.expressStandards.length ? 'good' : 'warning'}>
            {alignment.expressStandards.length ? `${alignment.expressStandards.length} saved item${alignment.expressStandards.length === 1 ? '' : 's'}` : 'Setup required'}
          </Status>
        </div>
        <p>{EXPRESS_SHELF_STANDARD.subtitle}</p>
        {!alignment.expressStandards.length && <p className="inventory-warning"><strong>{EXPRESS_SHELF_STANDARD.incompleteStatus}</strong></p>}
        <p className={alignment.expressGuidance?.objectPath ? 'inventory-message success' : 'inventory-warning'}>{expressImageStatus}</p>
        <ol>
          {EXPRESS_SHELF_STANDARD.chain.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <p className="inventory-policy-note">{EXPRESS_SHELF_STANDARD.doneWhen}</p>
        <div className="inventory-action-row">
          <button type="button" className="secondary-button" onClick={onOpenStandards}>Maintain saved standard</button>
          <button type="button" className="secondary-button" onClick={onOpenGuidance}>Maintain current image</button>
        </div>
      </section>

      <section className="inventory-panel">
        <div className="inventory-panel-heading">
          <div><p className="eyebrow">Workbar</p><h2>Workbar Milk Fridge</h2></div>
          <Status tone={alignment.milkStandards.length === 10 ? 'good' : 'warning'}>{alignment.milkStandards.length}/10 count lines</Status>
        </div>
        <p><strong>Permanent setup:</strong> top shelf exactly 2 regular milk and 2 Oatly; lower shelves opened, visibly date-labelled wine only; refrigerator powered on.</p>
        <p><strong>Stock Count:</strong> actual physical quantities for the ten configured wines. Milk and Oatly are routine-only and never become count or Millum rows.</p>
        <details>
          <summary>Approved opened-wine scope ({WORKBAR_MILK_FRIDGE_WINES.length})</summary>
          {WORKBAR_MILK_FRIDGE_WINES.map((wine) => <p key={wine.millumItemRef}><strong>{wine.millumItemRef}</strong> · {wine.name}</p>)}
        </details>
        <details>
          <summary>Deferred product provenance</summary>
          <p><strong>{PLANETA_INITIAL_SCOPE_DEFERRAL.millumItemRef} · {PLANETA_INITIAL_SCOPE_DEFERRAL.name}</strong></p>
          <p>{PLANETA_INITIAL_SCOPE_DEFERRAL.note}</p>
        </details>
      </section>

      <section className="inventory-panel">
        <p className="eyebrow">Other aligned locations</p>
        <h2>Workbar Coffee Station and Workbar Snack Shelf</h2>
        <p>{alignment.snackShelf?.metadata?.standardStatus || 'Setup in progress — standard awaiting completion.'}</p>
        <p>{alignment.snackShelf?.metadata?.imageStatus || 'Default image awaiting upload.'}</p>
        {alignment.retiredLegacy.length > 0 && (
          <details>
            <summary>Retired legacy Beverage Storage mappings ({alignment.retiredLegacy.length})</summary>
            {alignment.retiredLegacy.map((location) => <p key={location.id}>{location.name} → {location.metadata?.canonicalMapping || 'Main Storage Fridge'}</p>)}
          </details>
        )}
      </section>
    </div>
  );
}
