# NANI Dairy Vaccination Guidance

Last updated: August 19, 2026.

This note explains how the Health screen vaccination list should be used for cattle and buffalo records, especially when the vial is a combined product such as FMD+HS, HS+BQ, FMD+HS+BQ, or a generic multivalent/6-in-1 product.

## Official Reference Basis

Primary references checked:

- Government of India DAHD National Animal Disease Control Programme: `https://dahd.gov.in/schemes/programmes/nadcp`
  - FMD mass vaccination.
  - Brucellosis calf vaccination.
  - Animal health cards, ear tagging, and INAPH-style record keeping.
- Madhya Pradesh Directorate of Animal Husbandry and Dairying biological products list: `https://mpdah.gov.in/organic-products`
  - State-produced/available biologicals including FMD, HS, BQ, Anthrax, and Brucella abortus strain 19.
- NDDB cattle and buffalo vaccination schedule: `https://www.nddb.coop/farmer/animal-health/vaccination/schedules`
  - Disease-wise first dose, booster, and repeat cycle for FMD, HS, BQ, Brucellosis, Theileriosis, Anthrax, IBR, and Rabies post-bite therapy.
- NDDB/IIL product information: `https://www.nddb.coop/services/rdbiotech/immunology`
  - Combined bovine vaccines exist, including FMD+HS and FMD+HS+BQ products.

## App Rule

The app should track vaccination by disease coverage, not only by brand name.

The Health screen now supports herd-style entry:

- Each vaccine option shows the next recommended date calculated from the selected dose date.
- `Next Due` auto-populates when the selected vaccine has a repeat cycle.
- Users can still edit `Next Due` manually for vet advice, product-label instructions, or local government campaigns.
- `Use Rec.` restores the calculated recommendation after manual edits.
- When more than one active animal exists, `Next Cow` moves the form to the next animal and `Save & Next Cow` saves the current vaccination then opens the next animal.

When a combined product is used:

- Select the matching combo option if available.
- Record the exact vial/product name in `Notes`.
- Record `Batch/Lot`.
- Set `Next Due` by the shortest required repeat cycle among the covered diseases.
- Confirm species, route, dose, and age eligibility with the veterinarian before administration.

## Current Preset Options

| App option | Use when | Default next due |
|---|---|---|
| FMD | FMD-only bovine vaccination | 6 months |
| FMD+HS | Vial label covers FMD and HS | 6 months |
| FMD+HS+BQ | Vial label covers FMD, HS, and BQ | 6 months |
| Brucellosis | Female bovine calf vaccination, usually 4-8 months | No routine repeat |
| HS | HS-only vaccination | 1 year |
| HS+BQ | Vial label covers HS and BQ | 1 year |
| BQ | BQ-only vaccination | 1 year |
| Anthrax | Endemic/outbreak-risk area as advised | 1 year |
| IBR | Vet-advised IBR vaccination | 6 months after booster schedule |
| Rabies | Post-bite therapy only | Manual schedule |
| LSD | State/local campaign advisory | 1 year |
| Theileriosis | Mainly crossbred/exotic cattle as advised | No routine repeat |
| 6-in-1 / Multi | Brand-specific multivalent product | Manual |
| Other | Government/vet advisory not in preset list | Manual |

## Practical Advice for 6-in-1 / Multivalent Products

Do not assume a product is suitable because it says `6-in-1`.

Some `6-in-1` products are for dogs or other species, not cattle or buffalo. Before recording or using it for dairy animals, check:

- Target species on label.
- Diseases covered.
- Dose volume.
- Route: subcutaneous, intramuscular, oral, etc.
- Age/pregnancy/lactation restrictions.
- Storage and expiry.
- Batch/lot number.
- Local government or veterinarian advisory.

For cattle and buffalo, if the label says FMD+HS+BQ, select `FMD+HS+BQ`. If it says a different multivalent combination, select `6-in-1 / Multi`, write the exact covered diseases in `Disease Target`, and set the next due manually.
