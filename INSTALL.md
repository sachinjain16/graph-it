# Installation

## Use as a project-local tool

Copy the template into any repo:

```powershell
New-Item -ItemType Directory -Force C:\path\to\project\tools
Copy-Item .\tools\semantic-kg.mjs C:\path\to\project\tools\semantic-kg.mjs
Set-Location C:\path\to\project
node .\tools\semantic-kg.mjs build
node .\tools\semantic-kg.mjs query --intent=code "MyComponent"
node .\tools\semantic-kg.mjs impact "MyComponent"
node .\tools\semantic-kg.mjs drift
```

## Use as a Clawpilot skill

Copy the `skill` folder contents into your local Clawpilot skills directory under a folder named `graph-it`.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.copilot\m-skills\graph-it"
Copy-Item .\skill\SKILL.md "$env:USERPROFILE\.copilot\m-skills\graph-it\SKILL.md" -Force
Copy-Item .\tools\semantic-kg.mjs "$env:USERPROFILE\.copilot\m-skills\graph-it\semantic-kg-template.mjs" -Force
```

Restart or refresh Clawpilot skill discovery if needed.
