{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            bun
            nodejs_22
            nixfmt
            tmux
            lnav # Log viewer for debug script
          ];

          shellHook = ''
            # Run setup if needed (idempotent, quick when already set up)
            if [ -f scripts/setup.ts ]; then
              bun run scripts/setup.ts --quiet 2>/dev/null || true
            fi
          '';
        };
      }
    );
}
