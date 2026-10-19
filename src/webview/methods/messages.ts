import type { EntryWords, MethodId } from "../../core/methods/common";

// The strings of the method views, kept apart from src/shared/i18n.ts so that the two grow independently.

const en = {
  names: { idef0: "IDEF0", sipoc: "SIPOC", dsm: "N² matrix", flow: "Process flow" } as Record<MethodId, string>,
  menu: { idef0: "View as IDEF0", sipoc: "View as SIPOC", dsm: "View as N² matrix", flow: "View as process flow" } as Record<MethodId, string>,
  back: "Back to the diagram",
  readOnly: "Derived from the model; edit the diagram or the JSON to change it.",
  process: "Process",
  node: "Node",
  inputs: "Inputs",
  controls: "Controls",
  outputs: "Outputs",
  mechanisms: "Mechanisms",
  suppliers: "Suppliers",
  customers: "Customers",
  none: "none",
  outside: "outside the model",
  environment: "environment",
  noModule: "no module",
  agents: "Agents",
  start: "start",
  end: "end",
  context: "A-0: {process} and what crosses its boundary",
  decomposition: "A0: the subprocesses of {process}, in order",
  idef0Hint: "Inputs are consumed, required, changed or affected objects; controls are conditions and events; outputs are results and state changes; mechanisms are modules and agents.",
  sipocHint: "Suppliers yield, change or affect an input; customers use an output, together with the agents that handle them.",
  dsmHint: "Row A, column B: the objects that processes performed by A give and processes performed by B take. Givers come before takers; modules in a cycle stay together, and their cells below the diagonal are marked.",
  flowHint: "Each subprocess sits in the lane of the module it requires first, or of the agent that handles it. Solid arrows lead to the next activity, dotted ones to a later activity that takes an object.",
  cycles: "Cycles: {list}",
  noCycles: "No cycles.",
  noProcess: "No process fits this view.",
  noFlow: "Only a process with subprocesses has a flow.",
  noMatrix: "The model has no modules.",
  words: { affected: "affected", event: "event", agent: "agent", notConsumed: "not consumed" } as EntryWords,
};

export type MethodMessages = typeof en;

const pl: MethodMessages = {
  names: { idef0: "IDEF0", sipoc: "SIPOC", dsm: "Macierz N²", flow: "Przebieg procesu" },
  menu: { idef0: "Widok IDEF0", sipoc: "Widok SIPOC", dsm: "Widok macierzy N²", flow: "Widok przebiegu procesu" },
  back: "Wróć do diagramu",
  readOnly: "Wyliczone z modelu; zmienia się je na diagramie albo w JSON.",
  process: "Proces",
  node: "Węzeł",
  inputs: "Wejścia",
  controls: "Sterowania",
  outputs: "Wyjścia",
  mechanisms: "Mechanizmy",
  suppliers: "Dostawcy",
  customers: "Odbiorcy",
  none: "brak",
  outside: "spoza modelu",
  environment: "otoczenie",
  noModule: "bez modułu",
  agents: "Wykonawcy",
  start: "start",
  end: "koniec",
  context: "A-0: {process} i to, co przekracza jego granicę",
  decomposition: "A0: podprocesy procesu {process}, po kolei",
  idef0Hint: "Wejścia to obiekty zużywane, wymagane, zmieniane albo modyfikowane; sterowania to warunki i zdarzenia; wyjścia to wyniki i zmiany stanu; mechanizmy to moduły i wykonawcy.",
  sipocHint: "Dostawca tworzy, zmienia albo modyfikuje wejście; odbiorca korzysta z wyjścia, razem z wykonawcami, którzy go obsługują.",
  dsmHint: "Wiersz A, kolumna B: obiekty, które dają procesy wykonywane przez A, a biorą procesy wykonywane przez B. Dający są przed biorącymi; moduły w cyklu stoją obok siebie, a ich komórki pod przekątną są wyróżnione.",
  flowHint: "Każdy podproces leży w torze modułu, którego wymaga jako pierwszego, albo wykonawcy, który go obsługuje. Ciągła strzałka prowadzi do następnej czynności, kropkowana do późniejszej, która bierze obiekt.",
  cycles: "Cykle: {list}",
  noCycles: "Brak cykli.",
  noProcess: "Żaden proces nie pasuje do tego widoku.",
  noFlow: "Przebieg ma tylko proces z podprocesami.",
  noMatrix: "Model nie ma modułów.",
  words: { affected: "modyfikowany", event: "zdarzenie", agent: "wykonawca", notConsumed: "niezużywany" },
};

export function methodMessages(language: string): MethodMessages {
  return language.toLowerCase().startsWith("pl") ? pl : en;
}
