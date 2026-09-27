# Window configuration and pricing

A user configures a window, the generator freezes the configuration into a snapshot, and the pricing module prices the snapshot with data from the ERP and other departments.

Generated from the OPM model. Edit the model file, not this document.

## Window configuration and pricing: system view

```mermaid
flowchart LR
  classDef object fill:transparent,stroke:#2e7d32,stroke-width:2px
  classDef module fill:transparent,stroke:#2e7d32,stroke-width:4px
  classDef process fill:transparent,stroke:#1565c0,stroke-width:2px
  classDef environmental stroke-dasharray:6 4
  o_user["User"]:::object
  o_ui["UI"]:::module
  o_generator["Generator"]:::module
  o_snapshotStore["Snapshot Store"]:::module
  o_pricingModule["Pricing Module"]:::module
  o_customer["Customer"]:::object
  o_departmentData["Department Data"]:::object
  o_contextManifest["Context Manifest"]:::object
  o_changeProposal["Change Proposal"]:::object
  o_decision["Decision<br/><i>passed · rejected · applied</i>"]:::object
  o_configuration["Configuration"]:::object
  o_snapshot["Snapshot<br/><i>valid · expired</i>"]:::object
  o_priceRequest["Price Request"]:::object
  o_priceResult["Price Result<br/><i>complete · approximate · partial · rejected</i>"]:::object
  o_productPrice["Product Price"]:::object
  o_transportPrice["Transport Price<br/><i>exact · approximate · missing</i>"]:::object
  o_leadTime["Lead Time"]:::object
  p_configuring(["Configuring"]):::process
  p_contextUpdating(["Context Updating"]):::process
  p_freezing(["Freezing"]):::process
  p_expiring(["Expiring"]):::process
  p_pricing(["Pricing"]):::process
  o_user --o|agent| p_configuring
  o_ui --o p_configuring
  p_configuring --> o_changeProposal
  o_generator --o p_configuring
  o_changeProposal --o p_configuring
  p_configuring --> o_decision
  o_changeProposal --> p_configuring
  o_configuration <--> p_configuring
  o_decision -->|"passed"| p_configuring
  p_configuring -->|"applied"| o_decision
  o_decision -.->|"c: passed"| p_configuring
  o_generator --o p_contextUpdating
  o_contextManifest <--> p_contextUpdating
  o_departmentData -.->|"e"| p_contextUpdating
  o_generator --o p_freezing
  o_snapshotStore --o p_freezing
  o_configuration --o p_freezing
  o_contextManifest --o p_freezing
  p_freezing --> o_snapshot
  o_snapshotStore --o p_expiring
  o_snapshot -->|"valid"| p_expiring
  p_expiring -->|"expired"| o_snapshot
  o_pricingModule --o p_pricing
  o_snapshot --o p_pricing
  o_customer --o p_pricing
  o_departmentData --o p_pricing
  o_priceRequest --> p_pricing
  p_pricing --> o_priceResult
  o_snapshot -.->|"c: valid"| p_pricing
  p_pricing --> o_productPrice
  p_pricing --> o_transportPrice
  p_pricing --> o_leadTime
  class o_customer,o_departmentData environmental
```

## Structure

```mermaid
flowchart LR
  classDef object fill:transparent,stroke:#2e7d32,stroke-width:2px
  classDef module fill:transparent,stroke:#2e7d32,stroke-width:4px
  classDef process fill:transparent,stroke:#1565c0,stroke-width:2px
  classDef environmental stroke-dasharray:6 4
  o_erp["ERP"]:::module
  o_customer["Customer"]:::object
  o_snapshot["Snapshot<br/><i>valid · expired</i>"]:::object
  o_bom["BOM"]:::object
  o_costDrivers["Cost Drivers"]:::object
  o_hash["Hash"]:::object
  o_priceResult["Price Result<br/><i>complete · approximate · partial · rejected</i>"]:::object
  o_productPrice["Product Price"]:::object
  o_transportPrice["Transport Price<br/><i>exact · approximate · missing</i>"]:::object
  o_leadTime["Lead Time"]:::object
  o_erp ---|consists of| o_customer
  o_snapshot ---|consists of| o_bom
  o_snapshot ---|consists of| o_costDrivers
  o_snapshot ---|exhibits| o_hash
  o_priceResult ---|consists of| o_productPrice
  o_priceResult ---|consists of| o_transportPrice
  o_priceResult ---|consists of| o_leadTime
  class o_erp,o_customer environmental
```

## Configuring

```mermaid
flowchart LR
  classDef object fill:transparent,stroke:#2e7d32,stroke-width:2px
  classDef module fill:transparent,stroke:#2e7d32,stroke-width:4px
  classDef process fill:transparent,stroke:#1565c0,stroke-width:2px
  classDef environmental stroke-dasharray:6 4
  subgraph p_configuring["Configuring"]
    direction TB
    p_proposing(["1 · Proposing"]):::process
    p_validating(["2 · Validating"]):::process
    p_applying(["3 · Applying"]):::process
    p_proposing ~~~ p_validating
    p_validating ~~~ p_applying
  end
  class p_configuring process
  o_user["User"]:::object
  o_ui["UI"]:::module
  o_changeProposal["Change Proposal"]:::object
  o_generator["Generator"]:::module
  o_decision["Decision<br/><i>passed · rejected · applied</i>"]:::object
  o_configuration["Configuration"]:::object
  o_user --o|agent| p_configuring
  o_ui --o p_configuring
  o_ui --o p_proposing
  p_proposing --> o_changeProposal
  o_generator --o p_validating
  o_changeProposal --o p_validating
  p_validating --> o_decision
  o_generator --o p_applying
  o_changeProposal --> p_applying
  o_configuration <--> p_applying
  o_decision -->|"passed"| p_applying
  p_applying -->|"applied"| o_decision
  o_decision -.->|"c: passed"| p_applying
```

## Pricing

```mermaid
flowchart LR
  classDef object fill:transparent,stroke:#2e7d32,stroke-width:2px
  classDef module fill:transparent,stroke:#2e7d32,stroke-width:4px
  classDef process fill:transparent,stroke:#1565c0,stroke-width:2px
  classDef environmental stroke-dasharray:6 4
  subgraph p_pricing["Pricing"]
    direction TB
    p_productPricing(["1 · Product Pricing"]):::process
    p_transportPricing(["2 · Transport Pricing"]):::process
    p_leadTimeEstimating(["3 · Lead Time Estimating"]):::process
    p_productPricing ~~~ p_transportPricing
    p_transportPricing ~~~ p_leadTimeEstimating
  end
  class p_pricing process
  o_pricingModule["Pricing Module"]:::module
  o_snapshot["Snapshot<br/><i>valid · expired</i>"]:::object
  o_customer["Customer"]:::object
  o_departmentData["Department Data"]:::object
  o_priceRequest["Price Request"]:::object
  o_priceResult["Price Result<br/><i>complete · approximate · partial · rejected</i>"]:::object
  o_productPrice["Product Price"]:::object
  o_transportPrice["Transport Price<br/><i>exact · approximate · missing</i>"]:::object
  o_leadTime["Lead Time"]:::object
  o_pricingModule --o p_pricing
  o_snapshot --o p_pricing
  o_customer --o p_pricing
  o_departmentData --o p_pricing
  o_priceRequest --> p_pricing
  p_pricing --> o_priceResult
  o_snapshot -.->|"c: valid"| p_pricing
  o_snapshot --o p_productPricing
  o_customer --o p_productPricing
  p_productPricing --> o_productPrice
  o_departmentData --o p_transportPricing
  p_transportPricing --> o_transportPrice
  o_departmentData --o p_leadTimeEstimating
  p_leadTimeEstimating --> o_leadTime
  o_priceResult ---|consists of| o_productPrice
  o_priceResult ---|consists of| o_transportPrice
  o_priceResult ---|consists of| o_leadTime
  class o_customer,o_departmentData environmental
```

## Snapshot lifecycle

```mermaid
flowchart LR
  classDef object fill:transparent,stroke:#2e7d32,stroke-width:2px
  classDef module fill:transparent,stroke:#2e7d32,stroke-width:4px
  classDef process fill:transparent,stroke:#1565c0,stroke-width:2px
  classDef environmental stroke-dasharray:6 4
  p_freezing(["Freezing"]):::process
  p_expiring(["Expiring"]):::process
  p_pricing(["Pricing"]):::process
  o_snapshot["Snapshot<br/><i>valid · expired</i>"]:::object
  o_snapshotStore["Snapshot Store"]:::module
  o_snapshotStore --o p_freezing
  p_freezing --> o_snapshot
  o_snapshotStore --o p_expiring
  o_snapshot -->|"valid"| p_expiring
  p_expiring -->|"expired"| o_snapshot
  o_snapshot --o p_pricing
  o_snapshot -.->|"c: valid"| p_pricing
```

## Modules

| Module | Performs | Takes | Gives | Changes |
|---|---|---|---|---|
| UI | Configuring, Proposing | none | Change Proposal | none |
| Generator | Validating, Applying, Context Updating, Freezing | Change Proposal, Configuration, Context Manifest | Decision, Snapshot | Configuration, Decision, Context Manifest |
| Snapshot Store | Freezing, Expiring | Configuration, Context Manifest | Snapshot | Snapshot |
| Pricing Module | Pricing | Price Request, Snapshot, Customer, Department Data | Price Result | none |
| ERP | none | none | none | none |

## Object states

### Decision

```mermaid
stateDiagram-v2
  direction LR
  state "passed" as s0
  state "rejected" as s1
  state "applied" as s2
  s0 --> s2 : Applying
```

### Snapshot

```mermaid
stateDiagram-v2
  direction LR
  state "valid" as s0
  state "expired" as s1
  s0 --> s1 : Expiring
```

### Price Result

```mermaid
stateDiagram-v2
  direction LR
  state "complete" as s0
  state "approximate" as s1
  state "partial" as s2
  state "rejected" as s3
```

### Transport Price

```mermaid
stateDiagram-v2
  direction LR
  state "exact" as s0
  state "approximate" as s1
  state "missing" as s2
```

## OPL

- UI, Generator, Snapshot Store, Pricing Module and ERP are modules.
- User is physical.
- ERP is environmental.
- ERP consists of Customer.
- Customer is environmental.
- Department Data is environmental.
- Decision can be passed, rejected or applied.
- Snapshot can be valid or expired.
- Snapshot consists of BOM and Cost Drivers.
- Snapshot exhibits Hash.
- Price Result can be complete, approximate, partial or rejected.
- Price Result consists of Product Price, Transport Price and Lead Time.
- Transport Price can be exact, approximate or missing.
- User handles Configuring.
- Configuring requires UI.
- Configuring zooms into Proposing, Validating and Applying, in that sequence.
- Proposing requires UI.
- Proposing yields Change Proposal.
- Validating requires Generator and Change Proposal.
- Validating yields Decision.
- Applying requires Generator.
- Applying consumes Change Proposal.
- Applying affects Configuration.
- Applying changes Decision from passed to applied.
- Applying occurs if Decision is passed, otherwise Applying is skipped.
- Context Updating requires Generator.
- Context Updating affects Context Manifest.
- Department Data initiates Context Updating.
- Freezing requires Generator, Snapshot Store, Configuration and Context Manifest.
- Freezing yields Snapshot.
- Expiring requires Snapshot Store.
- Expiring changes Snapshot from valid to expired.
- Pricing requires Pricing Module, Snapshot, Customer and Department Data.
- Pricing consumes Price Request.
- Pricing yields Price Result.
- Pricing occurs if Snapshot is valid, otherwise Pricing is skipped.
- Pricing zooms into Product Pricing, Transport Pricing and Lead Time Estimating, in that sequence.
- Product Pricing requires Snapshot and Customer.
- Product Pricing yields Product Price.
- Transport Pricing requires Department Data.
- Transport Pricing yields Transport Price.
- Lead Time Estimating requires Department Data.
- Lead Time Estimating yields Lead Time.
