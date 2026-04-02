#!/usr/bin/env python3
"""Capture screenshots of silvery.dev for visual SEO audit."""

from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "/Users/beorn/Code/pim/km/screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

PAGES = [
    ("homepage", "https://silvery.dev/"),
    ("quick-start", "https://silvery.dev/getting-started/quick-start.html"),
    ("api-box", "https://silvery.dev/api/box.html"),
    ("component-selectlist", "https://silvery.dev/components/SelectList.html"),
    ("themes", "https://silvery.dev/themes.html"),
]

VIEWPORTS = [
    ("desktop", 1920, 1080),
    ("laptop", 1366, 768),
    ("mobile", 375, 812),
]

def capture(page_name, url, viewport_name, width, height, browser):
    print(f"  Capturing {page_name} @ {viewport_name} ({width}x{height})...")
    page = browser.new_page(viewport={"width": width, "height": height})
    try:
        page.goto(url, wait_until="networkidle", timeout=30000)
        # Wait a bit extra for fonts/animations
        page.wait_for_timeout(1500)

        # Above-the-fold (viewport-only)
        atf_path = f"{SCREENSHOTS_DIR}/{page_name}-{viewport_name}-atf.png"
        page.screenshot(path=atf_path, full_page=False)

        # Full page
        full_path = f"{SCREENSHOTS_DIR}/{page_name}-{viewport_name}-full.png"
        page.screenshot(path=full_path, full_page=True)

        # Capture page title and meta description for analysis
        title = page.title()
        meta_desc = page.evaluate("""
            () => {
                const el = document.querySelector('meta[name="description"]');
                return el ? el.getAttribute('content') : null;
            }
        """)
        h1_text = page.evaluate("""
            () => {
                const el = document.querySelector('h1');
                return el ? el.innerText.trim() : null;
            }
        """)
        cta_visible = page.evaluate("""
            () => {
                // Look for common CTA patterns
                const anchors = Array.from(document.querySelectorAll('a'));
                const ctas = anchors.filter(a => {
                    const text = a.innerText.toLowerCase();
                    return text.includes('get started') || text.includes('quick start') ||
                           text.includes('install') || text.includes('learn more') ||
                           text.includes('documentation') || text.includes('guide');
                });
                return ctas.map(a => ({
                    text: a.innerText.trim(),
                    href: a.href,
                    visible: a.getBoundingClientRect().top < window.innerHeight
                }));
            }
        """)
        has_horizontal_scroll = page.evaluate("""
            () => document.body.scrollWidth > window.innerWidth
        """)

        print(f"    Title: {title}")
        print(f"    H1: {h1_text}")
        print(f"    Meta desc: {meta_desc}")
        print(f"    Horizontal scroll: {has_horizontal_scroll}")
        if cta_visible:
            for cta in cta_visible[:3]:
                visibility = "VISIBLE ATF" if cta["visible"] else "below fold"
                print(f"    CTA [{visibility}]: {cta['text'][:50]}")

        return {
            "page": page_name,
            "url": url,
            "viewport": viewport_name,
            "title": title,
            "h1": h1_text,
            "meta_desc": meta_desc,
            "has_horizontal_scroll": has_horizontal_scroll,
            "ctas": cta_visible,
            "atf_path": atf_path,
            "full_path": full_path,
        }
    finally:
        page.close()


def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox"])
        print("=== Capturing silvery.dev screenshots ===\n")

        for page_name, url in PAGES:
            print(f"\n[{page_name}] {url}")
            for viewport_name, width, height in VIEWPORTS:
                result = capture(page_name, url, viewport_name, width, height, browser)
                results.append(result)

        browser.close()

    print("\n=== Done. Screenshots saved to:", SCREENSHOTS_DIR)
    print(f"Total screenshots: {len(results) * 2} files")
    return results


if __name__ == "__main__":
    main()
