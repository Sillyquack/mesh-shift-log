import { createElement } from 'react';
import InventoryCounterExperience from './InventoryCounterExperience.jsx';

export { CounterAssignmentManager } from './InventoryCounterWorkflowsLegacy.jsx';

export function CounterInventoryWorkspace(props) {
  return createElement(InventoryCounterExperience, props);
}
