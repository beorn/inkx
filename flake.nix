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
            ripgrep

            # Diagram tools (ASCII art creation + validation)
            boxes # Draw boxes around text
            graph-easy # Render graphs as ASCII/Unicode from DOT or simple syntax
          ];

          # Note: Run 'bun run setup' manually after first clone
          # (auto-running in shellHook causes spam during nix evaluation)
        };
      }
    );
}
