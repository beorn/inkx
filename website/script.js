// ===== Terminal Typing Animation =====
const commands = [
  {
    cmd: "km init",
    output: `<span class="tree-line">Initialized km in ~/notes</span>
<span class="tree-line">Found 847 markdown files</span>
<span class="tree-line">Indexed 2,341 tasks</span>
<span class="tree-line">Ready.</span>`,
  },
  {
    cmd: "km tree",
    output: `<span class="tree-line"><span class="folder">~/notes</span></span>
<span class="tree-line">  <span class="folder">Projects/</span></span>
<span class="tree-line">    <span class="file">Knowledge Machine.md</span></span>
<span class="tree-line">    <span class="file">Website Redesign.md</span></span>
<span class="tree-line">  <span class="folder">Areas/</span></span>
<span class="tree-line">    <span class="file">Health.md</span></span>
<span class="tree-line">    <span class="file">Finance.md</span></span>
<span class="tree-line">  <span class="folder">Resources/</span></span>
<span class="tree-line">    <span class="file">AI Research.md</span></span>`,
  },
  {
    cmd: "km task",
    output: `<span class="tree-line"><span class="task">[ ]</span> Review agent architecture</span>
<span class="tree-line"><span class="task">[ ]</span> Implement watch mode</span>
<span class="tree-line"><span class="task-done">[x]</span> Design knowledge tree</span>
<span class="tree-line"><span class="task-done">[x]</span> Set up event sourcing</span>
<span class="tree-line"><span class="task">[ ]</span> Build TUI kanban board</span>`,
  },
  {
    cmd: "km board",
    output: `<span class="tree-line">┌─────────────────────────────────────────┐</span>
<span class="tree-line">│  <span class="folder">TODO</span>  │  <span class="task">DOING</span>  │  <span class="task-done">DONE</span>  │</span>
<span class="tree-line">├─────────────────────────────────────────┤</span>
<span class="tree-line">│ Review   │ Watch   │ Tree     │</span>
<span class="tree-line">│ agent    │ mode    │ design   │</span>
<span class="tree-line">│          │         │          │</span>
<span class="tree-line">│ TUI      │         │ Event    │</span>
<span class="tree-line">│ board    │         │ sourcing │</span>
<span class="tree-line">└─────────────────────────────────────────┘</span>`,
  },
];

let currentCommandIndex = 0;
let charIndex = 0;
let isTyping = true;
let isPausing = false;

const cmdElement = document.getElementById("cmd1");
const cursorElement = document.getElementById("cursor1");
const outputElement = document.getElementById("output1");

function typeCommand() {
  if (!cmdElement || !outputElement) return;

  const currentCommand = commands[currentCommandIndex];

  if (isTyping) {
    if (charIndex < currentCommand.cmd.length) {
      cmdElement.textContent = currentCommand.cmd.substring(0, charIndex + 1);
      charIndex++;
      setTimeout(typeCommand, 50 + Math.random() * 50);
    } else {
      isTyping = false;
      isPausing = true;
      setTimeout(typeCommand, 500);
    }
  } else if (isPausing) {
    isPausing = false;
    cursorElement.style.display = "none";
    outputElement.innerHTML = currentCommand.output;
    setTimeout(typeCommand, 3000);
  } else {
    // Move to next command
    currentCommandIndex = (currentCommandIndex + 1) % commands.length;
    charIndex = 0;
    isTyping = true;
    cmdElement.textContent = "";
    outputElement.innerHTML = "";
    cursorElement.style.display = "inline";
    setTimeout(typeCommand, 500);
  }
}

// ===== Floating Particles =====
function createParticles() {
  const particlesContainer = document.getElementById("particles");
  if (!particlesContainer) return;

  const particleCount = 30;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.left = Math.random() * 100 + "%";
    particle.style.animationDuration = 15 + Math.random() * 20 + "s";
    particle.style.animationDelay = Math.random() * 10 + "s";
    particle.style.opacity = 0.1 + Math.random() * 0.3;
    particlesContainer.appendChild(particle);
  }
}

// ===== Smooth scroll for navigation =====
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute("href"));
    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  });
});

// ===== Intersection Observer for animations =====
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px 0px -50px 0px",
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("animate-in");
    }
  });
}, observerOptions);

// Observe all animatable elements
document
  .querySelectorAll(
    ".problem-card, .feature-card, .use-case-card, .timeline-item",
  )
  .forEach((el) => {
    el.style.opacity = "0";
    el.style.transform = "translateY(20px)";
    el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(el);
  });

// Add animation class
const style = document.createElement("style");
style.textContent = `
    .animate-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
    }
`;
document.head.appendChild(style);

// ===== Waitlist Form =====
const waitlistForm = document.getElementById("waitlist-form");
if (waitlistForm) {
  waitlistForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = this.querySelector('input[type="email"]').value;
    const button = this.querySelector("button");
    const originalText = button.innerHTML;

    // Simulate submission
    button.innerHTML = "<span>Joining...</span>";
    button.disabled = true;

    setTimeout(() => {
      button.innerHTML = "<span>You're on the list!</span>";
      button.style.background =
        "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)";

      setTimeout(() => {
        button.innerHTML = originalText;
        button.disabled = false;
        button.style.background = "";
        this.querySelector("input").value = "";
      }, 3000);
    }, 1000);
  });
}

// ===== Nav background on scroll =====
const nav = document.querySelector(".nav");
let lastScroll = 0;

window.addEventListener("scroll", () => {
  const currentScroll = window.pageYOffset;

  if (currentScroll > 100) {
    nav.style.background = "rgba(10, 10, 15, 0.95)";
  } else {
    nav.style.background = "rgba(10, 10, 15, 0.8)";
  }

  lastScroll = currentScroll;
});

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", () => {
  createParticles();
  setTimeout(typeCommand, 1000);
});
