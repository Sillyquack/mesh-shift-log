import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  EXPRESS_SHELF_STANDARD,
  MAIN_STORAGE_ORIENTATION,
  MAIN_STORAGE_ZONES,
  PLANETA_INITIAL_SCOPE_DEFERRAL,
  UNLISTED_OPENED_WINE,
  WORKBAR_MILK_FRIDGE_WINES,
} from '../data/inventoryLocationAlignment.js';
import '../styles.css';
import '../design-system/MeshExperienceSystem.css';
import './inventoryLocationReviewHarness.css';

const scenario = new URLSearchParams(window.location.search).get('scenario') || 'main-storage';

const scenarios = {
  'main-storage': ['Main Storage Fridge', 'One combined physical count', 'Left Reserve, Express Shelf and Keg Storage are one Main Storage Fridge count.'],
  'left-reserve': ['Left Reserve', 'Left side · reserve source', 'All reserve stock except beer kegs. Replenishes Express Shelf.'],
  'express-incomplete': ['Express Shelf', EXPRESS_SHELF_STANDARD.incompleteStatus, EXPRESS_SHELF_STANDARD.frontlineIncomplete],
  'express-configured': ['Express Shelf', 'Current saved standard configured', 'Manager-maintained product quantities, active lines and stable display order.'],
  'express-awaiting-image': ['Express Shelf', EXPRESS_SHELF_STANDARD.imageStatus, 'Written guidance is current; no image is claimed present.'],
  'express-current-image': ['Express Shelf', 'Current manager image available.', 'The latest manager replacement is the current setup reference.'],
  'keg-storage': ['Keg Storage', 'Right side · outside refill chain', 'Beer kegs remain in the combined Main Storage count.'],
  'milk-fridge': ['Workbar Milk Fridge', 'Permanent setup and actual Stock Count are separate', 'Exactly 2 regular milk + 2 Oatly on top; only opened, visibly date-labelled wine below.'],
  'unlisted-wine': [UNLISTED_OPENED_WINE.title, 'Manager attention required', UNLISTED_OPENED_WINE.frontline],
  'coffee': ['Workbar Coffee Station', 'Canonical display name', 'Existing identity preserved.'],
  'snacks': ['Workbar Snack Shelf', 'Setup in progress — standard awaiting completion.', 'Default image awaiting upload.'],
  'refill-chain': ['Service-fridge refill chain', 'Service fridge ← Express Shelf ← Left Reserve', EXPRESS_SHELF_STANDARD.doneWhen],
  'legacy-mapping': ['Legacy Beverage Storage', 'Retired dependency-free placeholders', 'Bottle/cocktail/event/dormant stock maps to Left Reserve; kegs map to Keg Storage.'],
};

function Detail() {
  if (scenario === 'main-storage') return <div className="il-zones">{MAIN_STORAGE_ZONES.map((zone) => <article key={zone.key}><span>{zone.position}</span><strong>{zone.name}</strong></article>)}</div>;
  if (scenario.startsWith('express-') || scenario === 'refill-chain') return <ol>{EXPRESS_SHELF_STANDARD.chain.map((step) => <li key={step}>{step}</li>)}</ol>;
  if (scenario === 'milk-fridge') return <><div className="il-fridge"><article><span>Top shelf · routine only</span><strong>2 regular milk + 2 Oatly</strong></article><article><span>Lower shelves · Stock Count</span><strong>10 configured wines · actual quantity</strong></article></div><details><summary>Approved wines and Planeta deferral</summary>{WORKBAR_MILK_FRIDGE_WINES.map((wine) => <p key={wine.millumItemRef}>{wine.millumItemRef} · {wine.name}</p>)}<p><strong>{PLANETA_INITIAL_SCOPE_DEFERRAL.millumItemRef} deferred:</strong> {PLANETA_INITIAL_SCOPE_DEFERRAL.note}</p></details></>;
  if (scenario === 'express-current-image') return <div className="il-current-image" role="img" aria-label="Deterministic fixture representing the current manager-provided Express Shelf image"><span>Current manager image</span><strong>Fixture only · no production upload</strong></div>;
  if (scenario === 'unlisted-wine') return <div className="il-alert" role="alert"><strong>Villa Example Bianco</strong><span>Awaiting manager resolution. No guessed product and no Millum value.</span></div>;
  return null;
}

function Harness() {
  const [title, status, description] = scenarios[scenario] || scenarios['main-storage'];
  return (
    <main className="il-shell" data-scenario={scenario}>
      <header><span>REVIEW FIXTURE · NO BACKEND WRITES</span><strong>Inventory location alignment</strong></header>
      <section className="il-card" aria-label={title}>
        <p className="eyebrow">{scenario.replaceAll('-', ' ')}</p>
        <h1>{title}</h1>
        <p className="il-status">{status}</p>
        <p>{description}</p>
        <Detail />
        <p className="il-orientation">{MAIN_STORAGE_ORIENTATION}</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
