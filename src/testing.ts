// silvery/testing — public testing surface
//
// @silvery/test remains an internal workspace package. This subpath bundles
// that implementation into the public silvery package so consumers do not
// depend on Silvery's internal package graph.

export * from "../packages/test/src/index.tsx"
