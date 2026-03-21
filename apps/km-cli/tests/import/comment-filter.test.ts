import { describe, expect, it } from "vitest"
import {
  filterSystemComment,
  isSystemAction,
  splitConsolidatedComment,
} from "../../src/import/adapters/asana/comment-filter.ts"

describe("filterSystemComment", () => {
  // ── Pattern 1: Single consolidated system block with soft hyphen prefix ──
  // From task "Yerba Mate (SF)", index 42 — single shy-prefixed system action
  it("removes a single consolidated system block (shy + header + action)", () => {
    const text =
      "\u00AD\nBjorn Stabell on Saturday Feb 25, 2017 02:57 AM:\nadded subtask to task Collect: Supplements & diet"
    const result = filterSystemComment(text, "2018-05-28T09:01:35.285Z")
    expect(result).toBe("")
  })

  // ── Pattern 2: Multi-block consolidated, all system ──
  // From task "Try https://www.elysiumhealth.com/ pills", index 2
  // 5 blocks: marked/unmarked/unassigned/moved/moved — all system actions
  it("removes multi-block consolidated comment where all blocks are system actions", () => {
    const text =
      "\u00AD\nBjorn Stabell on Friday Mar 24, 2017 05:10 AM:\nmarked today\n\n\u00AD\nBjorn Stabell on Saturday Mar 25, 2017 05:34 AM:\nunmarked today\n\n\u00AD\nBjorn Stabell on Saturday Mar 25, 2017 05:34 AM:\nunassigned from you\n\n\u00AD\nBjorn Stabell on Wednesday Apr 05, 2017 11:40 PM:\nmoved into Health & exercise (@ Palo Alto)\n\n\u00AD\nBjorn Stabell on Sunday Apr 15, 2018 10:45 PM:\nmoved from Car & insurance to Health & exercise (@ Palo Alto)"
    const result = filterSystemComment(text, "2018-05-28T09:54:56.692Z")
    expect(result).toBe("")
  })

  // ── Pattern 3: Mixed block (some system, some real content) ──
  // From task "Dermatology", index 29
  // 5 blocks: removed due date / unassigned / changed description / REAL checkup note / changed description
  it("keeps real content blocks and strips system blocks from mixed comment", () => {
    const text =
      "\u00AD\nBjorn Stabell on Saturday Jan 21, 2017 08:06 AM:\nremoved the due date\n\n\u00AD\nBjorn Stabell on Saturday Jan 21, 2017 08:07 AM:\nunassigned from you\n\n\u00AD\nBjorn Stabell on Thursday Feb 01, 2018 09:00 AM:\nchanged the description\n\n\u00AD\nBjorn Stabell on Monday Feb 05, 2018 04:06 AM:\nDid annual checkup with Dr Na, BJUFH - no problems, she said to do checkup every 2 years is ok\n\n\u00AD\nBjorn Stabell on Monday Feb 05, 2018 04:07 AM:\nchanged the description"
    const result = filterSystemComment(text, "2018-05-28T09:15:04.331Z")
    expect(result).toBe(
      "Bjorn Stabell on Monday Feb 05, 2018 04:06 AM:\nDid annual checkup with Dr Na, BJUFH - no problems, she said to do checkup every 2 years is ok",
    )
  })

  // ── Pattern 4: Pure real comment (no system actions, pre-2020) ──
  // From task "Oct/Nov Family United check", index 73 — medical notes
  it("preserves pure real comment with no system actions (pre-2020)", () => {
    const text =
      "x-ray? ulcer? Chron's? do blood screen again?\n\nTheory\n- stomach causing stress feeling => anxiety\n- stretching, sitting?\n\nNausea, tight stomach, bloating, burping\n50x nervous sensations from bowel => stress/el/overwhelm\nHard to think\nEdgy\nVision more blurry than normal\nRarely: Face flush, sweaty palms\n\nWhat causes what\nTime delay of symptoms\nMental model of stress - bottle, time - how to measure\nNerves in stomach or spine only - damage from muscle wrap\n\n=>\n\nStomach = second brain\nPossible that there's back-and-forth interaction"
    const result = filterSystemComment(text, "2019-10-28T07:25:30.757Z")
    expect(result).toBe(text)
  })

  // ── Pattern 5: Post-2020 comment (should not be filtered regardless of content) ──
  // From task "🏃‍♂️ EXERCISE LOG", index 3 — exercise log entries
  it("never filters post-2020 comments (after SYSTEM_COMMENT_CUTOFF)", () => {
    const text =
      "220522 Run 7km\n220521 Run 3.7km\n220520 Stiff guy's club 3/3\n220519 ST barbell w Gabe\n220516 Run 3.7km\n220510 Run 3.7km - ankle's hurt\n220506 Stiff guy's club\n220504 CrossFit BC 1h\n220503 Run 3.7km\n220502 Run 3.7.km\n220429 KB + run 3.7km + stiff guy's club\n220425 run 3.7km\n220421 KB + run 3.7km\n220414 KB + run 3.7km\n220413 Walk & cycle with Dom\n220412 SS barbell (B) w Gabe\n220410 Run 3.7km\n220407 Run 3.7km\n220406 Run 4km\n220405 SS barbell (A) w Gabe @ Loaded Athletics\n220404 KB + run\n220404 Ran 4.2km"
    const result = filterSystemComment(text, "2022-05-29T01:36:36.425Z")
    expect(result).toBe(text)
  })

  // ── Pattern 6: Single standalone system action (no consolidated header format) ──
  // This tests the fallback path: isSystemAction(stripInvisible(text).trim())
  // Uses action text extracted from blocks in the JSON data
  it("removes standalone system action text without consolidated header", () => {
    expect(filterSystemComment("added subtask to task Collect: Supplements & diet", "2018-05-28T09:01:35.285Z")).toBe(
      "",
    )
    expect(
      filterSystemComment("moved from Car & insurance to Health & exercise (@ Palo Alto)", "2018-05-28T09:54:56.692Z"),
    ).toBe("")
    expect(filterSystemComment("marked today", "2017-03-24T05:10:00.000Z")).toBe("")
  })
})

describe("splitConsolidatedComment", () => {
  it("splits two user comments separated by soft hyphen", () => {
    const text =
      "\u00AD\nBjorn Stabell on Friday Mar 03, 2017 06:37 AM:\nChecked:\n- living ok\n- kitchen & bedroom - pressure ok, return ok, but floor not warm\n- bath - ok, except return warm even when off\n\n\u00AD\nBjorn Stabell on Friday Mar 03, 2017 06:38 AM:\nThey should call us soon"
    const result = splitConsolidatedComment(text, "2018-05-29T00:00:00Z")

    expect(result).toHaveLength(2)
    expect(result[0]!.date).toBe("2017-03-03")
    expect(result[0]!.text).toBe(
      "Checked:\n- living ok\n- kitchen & bedroom - pressure ok, return ok, but floor not warm\n- bath - ok, except return warm even when off",
    )
    expect(result[1]!.date).toBe("2017-03-03")
    expect(result[1]!.text).toBe("They should call us soon")
  })

  it("filters system blocks and keeps user blocks", () => {
    const text =
      "\u00AD\nBjorn Stabell on Saturday Jan 21, 2017 08:06 AM:\nremoved the due date\n\n\u00AD\nBjorn Stabell on Monday Feb 05, 2018 04:06 AM:\nDid annual checkup - no problems"
    const result = splitConsolidatedComment(text, "2018-05-28T09:15:04.331Z")

    expect(result).toHaveLength(1)
    expect(result[0]!.date).toBe("2018-02-05")
    expect(result[0]!.text).toBe("Did annual checkup - no problems")
  })

  it("returns single comment with extracted date from header", () => {
    const text = "\u00AD\nBjorn Stabell on Monday Feb 05, 2018 04:06 AM:\nDid annual checkup with Dr Na"
    const result = splitConsolidatedComment(text, "2018-05-28T09:15:04.331Z")

    expect(result).toHaveLength(1)
    expect(result[0]!.date).toBe("2018-02-05")
    expect(result[0]!.text).toBe("Did annual checkup with Dr Na")
  })

  it("returns original text when no consolidated headers present", () => {
    const text = "Just a plain comment"
    const result = splitConsolidatedComment(text, "2022-05-29T01:36:36.425Z")

    expect(result).toHaveLength(1)
    expect(result[0]!.date).toBeUndefined()
    expect(result[0]!.text).toBe("Just a plain comment")
  })

  it("returns empty array when all blocks are system actions", () => {
    const text =
      "\u00AD\nBjorn Stabell on Friday Mar 24, 2017 05:10 AM:\nmarked today\n\n\u00AD\nBjorn Stabell on Saturday Mar 25, 2017 05:34 AM:\nunmarked today"
    const result = splitConsolidatedComment(text, "2018-05-28T09:54:56.692Z")

    expect(result).toHaveLength(0)
  })

  it("post-2020 comments skip system filtering but still parse headers", () => {
    const text = "\u00AD\nBjorn Stabell on Monday Jan 06, 2020 10:00 AM:\nSome user content"
    const result = splitConsolidatedComment(text, "2022-01-01T00:00:00Z")

    expect(result).toHaveLength(1)
    expect(result[0]!.date).toBe("2020-01-06")
    expect(result[0]!.text).toBe("Some user content")
  })
})

describe("isSystemAction", () => {
  // Action texts extracted from actual Asana comments in the JSON
  it("detects system actions from real Asana data", () => {
    expect(isSystemAction("added subtask to task Collect: Supplements & diet")).toBe(true)
    expect(isSystemAction("moved into Health & exercise (@ Palo Alto)")).toBe(true)
    expect(isSystemAction("moved from Car & insurance to Health & exercise (@ Palo Alto)")).toBe(true)
    expect(isSystemAction("marked today")).toBe(true)
    expect(isSystemAction("unmarked today")).toBe(true)
    expect(isSystemAction("unassigned from you")).toBe(true)
    expect(isSystemAction("unassigned from Shi Delei")).toBe(true)
    expect(isSystemAction("removed the due date")).toBe(true)
    expect(isSystemAction("changed the description")).toBe(true)
    expect(isSystemAction('changed the name to "Dr Rhonda\'s Micronutrient shake"')).toBe(true)
    expect(isSystemAction("completed this task")).toBe(true)
    expect(isSystemAction("removed from @ Beijing")).toBe(true)
    expect(isSystemAction("removed from ✚ Body")).toBe(true)
    expect(isSystemAction("added the description")).toBe(true)
  })

  it("does not flag real comment content as system actions", () => {
    expect(
      isSystemAction("Did annual checkup with Dr Na, BJUFH - no problems, she said to do checkup every 2 years is ok"),
    ).toBe(false)
    expect(isSystemAction("x-ray? ulcer? Chron's? do blood screen again?")).toBe(false)
    expect(isSystemAction("220522 Run 7km")).toBe(false)
    expect(isSystemAction("Shooting tricks:")).toBe(false)
  })
})
