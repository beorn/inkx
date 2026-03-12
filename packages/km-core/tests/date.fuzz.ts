/**
 * Property-based fuzz tests for date composition/decomposition roundtrip
 *
 * Key properties tested:
 * 1. Roundtrip — decompose(compose(date, time)) recovers date and time
 * 2. No crash on valid dates — random valid ISO 8601 dates don't throw
 * 3. Stability — dateOnly and timeOnly are consistent with decompose
 */

import { test, describe, expect, gen, take, type SeededRandom } from "vimonkey"
import { composeDatetime, decomposeDatetime, dateOnly, timeOnly } from "../src/date-utils.ts"

// ---------------------------------------------------------------------------
// Date generators
// ---------------------------------------------------------------------------

/** Generate a random date string (YYYY-MM-DD) */
function randomDate(rng: SeededRandom): string {
  const year = rng.int(2020, 2030)
  const month = String(rng.int(1, 12)).padStart(2, "0")
  const day = String(rng.int(1, 28)).padStart(2, "0") // max 28 to avoid invalid dates
  return `${year}-${month}-${day}`
}

/** Generate a random time string (HH:MM) */
function randomTime(rng: SeededRandom): string {
  const hour = String(rng.int(0, 23)).padStart(2, "0")
  const minute = String(rng.int(0, 59)).padStart(2, "0")
  return `${hour}:${minute}`
}

/** Generate a random timezone offset (e.g. -08:00, +05:30) */
function randomTzOffset(rng: SeededRandom): string {
  const sign = rng.pick(["+", "-"])
  const hour = String(rng.int(0, 14)).padStart(2, "0")
  const minute = rng.pick(["00", "30", "45"])
  return `${sign}${hour}:${minute}`
}

/** Generate a random IANA timezone name */
function randomTzName(rng: SeededRandom): string {
  return rng.pick([
    "America/Los_Angeles",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Tokyo",
    "UTC",
    "Pacific/Auckland",
  ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Date Roundtrip Fuzz: compose/decompose", () => {
  test.fuzz("date-only roundtrip recovers date", async () => {
    const dates = gen(({ random }) => randomDate(random))

    for await (const date of take(dates, 500)) {
      const composed = composeDatetime(date)
      expect(composed).toBe(date)

      const parts = decomposeDatetime(composed)
      expect(parts).toBeDefined()
      expect(parts!.date).toBe(date)
      expect(parts!.time).toBeUndefined()
    }
  })

  test.fuzz("date+time roundtrip recovers both", async () => {
    const dateTimes = gen(({ random }) => ({
      date: randomDate(random),
      time: randomTime(random),
    }))

    for await (const { date, time } of take(dateTimes, 500)) {
      const composed = composeDatetime(date, time)
      expect(composed).toBe(`${date}T${time}`)

      const parts = decomposeDatetime(composed)
      expect(parts).toBeDefined()
      expect(parts!.date).toBe(date)
      expect(parts!.time).toBe(time)
    }
  })

  test.fuzz("date+time+tz roundtrip recovers date and time (tz ignored in compose)", async () => {
    const dateTimes = gen(({ random }) => ({
      date: randomDate(random),
      time: randomTime(random),
      tz: randomTzName(random),
    }))

    for await (const { date, time, tz } of take(dateTimes, 200)) {
      // composeDatetime ignores tz — it's a legacy parameter
      const composed = composeDatetime(date, time, tz)
      expect(composed).toBe(`${date}T${time}`)

      const parts = decomposeDatetime(composed)
      expect(parts).toBeDefined()
      expect(parts!.date).toBe(date)
      expect(parts!.time).toBe(time)
    }
  })
})

describe("Date Roundtrip Fuzz: decompose ISO strings with offsets", () => {
  test.fuzz("ISO with seconds and offset decomposes correctly", async () => {
    const isoStrings = gen(({ random }) => {
      const date = randomDate(random)
      const time = randomTime(random)
      const seconds = String(random.int(0, 59)).padStart(2, "0")
      const offset = randomTzOffset(random)
      return { iso: `${date}T${time}:${seconds}${offset}`, date, time }
    })

    for await (const { iso, date, time } of take(isoStrings, 300)) {
      const parts = decomposeDatetime(iso)
      expect(parts).toBeDefined()
      expect(parts!.date).toBe(date)
      expect(parts!.time).toBe(time)
    }
  })
})

describe("Date Roundtrip Fuzz: Utility consistency", () => {
  test.fuzz("dateOnly matches decompose().date", async () => {
    const isoStrings = gen(({ random }) => {
      const date = randomDate(random)
      if (random.bool(0.5)) {
        return `${date}T${randomTime(random)}`
      }
      return date
    })

    for await (const iso of take(isoStrings, 500)) {
      const parts = decomposeDatetime(iso)
      const dOnly = dateOnly(iso)
      expect(dOnly).toBe(parts?.date)
    }
  })

  test.fuzz("timeOnly matches decompose().time", async () => {
    const isoStrings = gen(({ random }) => {
      const date = randomDate(random)
      if (random.bool(0.5)) {
        return `${date}T${randomTime(random)}`
      }
      return date
    })

    for await (const iso of take(isoStrings, 500)) {
      const parts = decomposeDatetime(iso)
      const tOnly = timeOnly(iso)
      expect(tOnly).toBe(parts?.time)
    }
  })
})

describe("Date Roundtrip Fuzz: Edge cases", () => {
  test.fuzz("null/undefined inputs return undefined", async () => {
    const inputs = gen(({ random }) => random.pick([null, undefined, "", null, undefined]))

    for await (const input of take(inputs, 100)) {
      expect(composeDatetime(input)).toBeUndefined()
      expect(decomposeDatetime(input)).toBeUndefined()
      expect(dateOnly(input)).toBeUndefined()
      expect(timeOnly(input)).toBeUndefined()
    }
  })

  test.fuzz("compose idempotency: compose then decompose then compose is stable", async () => {
    const dateTimes = gen(({ random }) => ({
      date: randomDate(random),
      time: random.bool(0.5) ? randomTime(random) : null,
    }))

    for await (const { date, time } of take(dateTimes, 300)) {
      const composed1 = composeDatetime(date, time)
      const parts = decomposeDatetime(composed1)
      const composed2 = composeDatetime(parts?.date, parts?.time)
      expect(composed2).toBe(composed1)
    }
  })
})
