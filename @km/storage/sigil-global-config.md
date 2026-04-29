---
id: "@km/storage/sigil-global-config"
aliases:
  - km-storage.sigil-global-config
  - km-storage-sigil-global-config
created_by: Bjørn Stabell
created_at: 2026-04-14T04:37:57Z
closed_at: 2026-04-16T23:17:49Z
close_reason: "Folded into km-storage.link-model-canonical (2026-04-16). Sigil
  is part of the node name, not a separate namespace: '@Alice', '#urgent',
  '+cleanup' are distinct node names. Serialization picks form from target name
  prefix. No separate config, no MdForm variants, no cross-namespace
  unification. Strict namespaces fall out from name uniqueness.
  ~/.config/km/config.yml not needed for v1."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.sigil-global-config
    depends_on_id: km-storage.sigil-strict-namespaces
    type: blocks
    created_at: 2026-04-15T12:25:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-storage.sigil-global-config
    depends_on_id: km-storage.sigils
    type: parent-child
    created_at: 2026-04-15T12:25:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Global km config (~/.config/km/config.yml) + ~ sigil resolver @km/storage #feature #P1 #config #sigils #user-global #vault-integration

blocks:: [[@km/storage/sigil-strict-namespaces]], [[@km/storage/sigils]]

Add a user-global config file at ~/.config/km/config.yml that km reads on startup. Defines: identity, default vaults, repo path mappings (for ~name sigil), external shortlinks (for ~name → URL), sigil customization, defaults, and area definitions. Also adds ~ as a recognized sigil alongside +, @, # — resolves to local repo paths or URLs. See ~/Bear/Vault/projects/+km/ref/ or the draft config already at ~/.config/km/config.yml for the full proposed shape.