import { Model } from "../../core/model";
import configuratorModel from "../presets/configurator-to-order.opm.json";
import phenomeModel from "../presets/phenome.opm.json";
import windowPricingModel from "../presets/window-pricing.opm.json";

export interface Preset {
  id: string;
  labelEn: string;
  labelPl: string;
  fileName: string;
  text: string;
  openStory?: string;
}

export const MAKIGAMI_STARTER: Model = {
  name: "New Makigami Procedure",
  description: "Start by mapping lanes and steps in the Makigami procedure editor, then click 'Sync / Generate OPM' to materialise OPM objects, states, processes and links.",
  objects: {
    customer: {
      essence: "physical",
      affiliation: "environmental",
      description: "Person initiating the procedure.",
    },
    salesModule: {
      role: "module",
      deploymentName: "sales_v1.0.0",
      capabilities: ["can_register_inquiry", "can_prepare_quote"],
      owns: ["owns_inquiry", "owns_quote"],
    },
    engineeringModule: {
      role: "module",
      deploymentName: "engineering_v1.0.0",
      capabilities: ["can_verify_feasibility"],
      owns: ["owns_technical_check"],
    },
    inquiry: {
      states: ["submitted", "verified", "quoted"],
      authority: "owns_inquiry",
    },
    quote: {
      states: ["draft", "sent"],
      authority: "owns_quote",
    },
  },
  processes: {
    registeringInquiry: {
      capability: "can_register_inquiry",
      handledBy: ["customer"],
      requires: ["salesModule"],
      yields: [{ object: "inquiry", state: "submitted" }],
    },
    verifyingFeasibility: {
      capability: "can_verify_feasibility",
      requires: ["engineeringModule"],
      changes: [{ object: "inquiry", from: "submitted", to: "verified" }],
    },
    preparingQuote: {
      capability: "can_prepare_quote",
      requires: ["salesModule", { object: "inquiry", state: "verified" }],
      yields: [{ object: "quote", state: "sent" }],
    },
  },
  stories: {
    quoteProcedure: {
      title: "Inquiry to Quote (Makigami)",
      story: "As a customer I want to submit an inquiry and receive a verified quote, so that I can place an order with confidence.",
      lanes: ["customer", "salesModule", "engineeringModule"],
      steps: [
        {
          lane: "customer",
          does: "Submits product inquiry with dimensions.",
          process: "registeringInquiry",
          handsOver: { object: "inquiry", state: "submitted", to: "salesModule" },
        },
        {
          lane: "salesModule",
          does: "Forwards technical inquiry for feasibility check.",
          handsOver: { object: "inquiry", state: "submitted", to: "engineeringModule" },
        },
        {
          lane: "engineeringModule",
          does: "Verifies technical feasibility of the inquiry.",
          process: "verifyingFeasibility",
          waits: "2h queue",
          handsOver: { object: "inquiry", state: "verified", to: "salesModule" },
        },
        {
          lane: "salesModule",
          does: "Calculates price and sends quote to customer.",
          process: "preparingQuote",
          handsOver: { object: "quote", state: "sent", to: "customer" },
        },
      ],
      doneWhen: [
        "Every technical inquiry is verified before a quote is sent.",
        "Quote includes lead time and price.",
      ],
    },
  },
};

export const BLANK_MODEL: Model = {
  name: "Untitled OPM Model",
  objects: {},
  processes: {},
};

export const PRESETS: Preset[] = [
  {
    id: "phenome",
    labelEn: "Phenome Platform (Mapping & Deployment)",
    labelPl: "Platforma Phenome (Mapowanie i Wdrożenia)",
    fileName: "phenome.opm.json",
    text: JSON.stringify(phenomeModel, null, 2) + "\n",
  },
  {
    id: "configurator",
    labelEn: "Configurator to Order (Reference Architecture)",
    labelPl: "Konfigurator do Zamówienia (Architektura Referencyjna)",
    fileName: "configurator-to-order.opm.json",
    text: JSON.stringify(configuratorModel, null, 2) + "\n",
  },
  {
    id: "window-pricing",
    labelEn: "Window Pricing (Example + Makigami)",
    labelPl: "Wycena Okien (Przykład + Makigami)",
    fileName: "window-pricing.opm.json",
    text: JSON.stringify(windowPricingModel, null, 2) + "\n",
  },
  {
    id: "makigami",
    labelEn: "Makigami Procedure + P28 Starter",
    labelPl: "Procedura Makigami + P28 (Starter)",
    fileName: "makigami-procedure.opm.json",
    text: JSON.stringify(MAKIGAMI_STARTER, null, 2) + "\n",
    openStory: "quoteProcedure",
  },
  {
    id: "blank",
    labelEn: "Blank Model",
    labelPl: "Pusty model",
    fileName: "model.opm.json",
    text: JSON.stringify(BLANK_MODEL, null, 2) + "\n",
  },
];
