import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────
async function upsertCategory(name: string, description: string) {
  return prisma.category.upsert({ where: { name }, update: { description }, create: { name, description } });
}
async function upsertSkill(code: string, name: string, description: string) {
  return prisma.skill.upsert({ where: { code }, update: { name, description }, create: { code, name, description } });
}
async function upsertSkillRole(skillId: string, code: string, name: string, sortOrder: number, defaults?: { easy?: number; medium?: number; hard?: number }) {
  const existing = await prisma.skillRole.findUnique({ where: { skillId_code: { skillId, code } } });
  if (existing) return existing;
  return prisma.skillRole.create({ data: { skillId, code, name, sortOrder, defaultEasyCount: defaults?.easy ?? null, defaultMediumCount: defaults?.medium ?? null, defaultHardCount: defaults?.hard ?? null } });
}
async function upsertTopic(categoryId: string, name: string, description: string, passMark = 60, revealAnswers = true) {
  const existing = await prisma.topic.findFirst({ where: { name, categoryId } });
  if (existing) return existing;
  return prisma.topic.create({ data: { categoryId, name, description, passMark, issueCertificate: true, showProficiencyOnCert: true, certValidityDays: 365, revealAnswersAfterTest: revealAnswers, proficiencyThresholds: [40, 55, 70, 85, 95] } });
}
async function q(
  topicId: string,
  skillId: string,
  roleIds: string | string[],
  difficulty: "easy" | "medium" | "hard",
  stem: string,
  options: string[],
  correctIndices: number | number[],
  explanation?: string,
  questionType: "single" | "multi" = "single"
) {
  const ids = Array.isArray(roleIds) ? roleIds : [roleIds];
  const indices = Array.isArray(correctIndices) ? correctIndices : [correctIndices];
  const type = questionType === "multi" || indices.length > 1 ? "multi" : "single";
  const existing = await prisma.question.findFirst({
    where: { topicId, skillId, stem, difficulty, status: "published" },
  });
  if (existing) {
    await prisma.question.update({
      where: { id: existing.id },
      data: {
        options,
        correctIndices: indices,
        questionType: type,
        explanation: explanation ?? "Refer to official documentation.",
      },
    });
    for (const skillRoleId of ids) {
      await prisma.questionSkillRole.upsert({
        where: { questionId_skillRoleId: { questionId: existing.id, skillRoleId } },
        create: { questionId: existing.id, skillRoleId },
        update: {},
      });
    }
    return;
  }
  await prisma.question.create({
    data: {
      topicId, skillId, difficulty, questionType: type, status: "published",
      stem, options, correctIndices: indices,
      explanation: explanation ?? "Refer to official documentation.",
      skillRoles: { create: ids.map((skillRoleId) => ({ skillRoleId })) },
    },
  });
}
async function mkBlueprint(
  admin: { id: string },
  name: string,
  skillId: string,
  topicIds: string[],
  roleId: string,
  easy: number,
  medium: number,
  hard: number,
  mins: number,
  cert?: {
    passMark?: number; issueCertificate?: boolean; showProficiencyOnCert?: boolean;
    certValidityDays?: number; revealAnswersAfterTest?: boolean;
    multiSelectScoringMode?: "all_or_nothing" | "partial_credit";
  }
) {
  const existing = await prisma.assessmentBlueprint.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.assessmentBlueprint.create({
    data: {
      name, skillId, skillRoleId: roleId,
      questionCount: easy + medium + hard, easyCount: easy, mediumCount: medium, hardCount: hard,
      timeLimitMinutes: mins, createdById: admin.id,
      passMark:               cert?.passMark               ?? 60,
      issueCertificate:       cert?.issueCertificate       ?? false,
      showProficiencyOnCert:  cert?.showProficiencyOnCert  ?? false,
      certValidityDays:       cert?.certValidityDays        ?? 0,
      revealAnswersAfterTest: cert?.revealAnswersAfterTest  ?? false,
      multiSelectScoringMode: cert?.multiSelectScoringMode ?? "all_or_nothing",
      topics: { create: topicIds.map((topicId) => ({ topicId })) },
    },
  });
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱  Seeding database...");

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORIES
  // ══════════════════════════════════════════════════════════════════════════
  const catProg     = await upsertCategory("Programming",                    "Software development and coding skills");
  const catCloud    = await upsertCategory("Cloud & DevOps",                 "Cloud platforms, containers, and CI/CD");
  const catData     = await upsertCategory("Data Engineering",               "Data pipelines, warehousing, and SQL");
  const catEcom     = await upsertCategory("eCommerce & Commerce Platforms", "Adobe Commerce, commercetools, composable commerce");
  const catCMS      = await upsertCategory("Headless CMS",                   "Contentful, Contentstack, headless content management");
  const catDXP      = await upsertCategory("Digital Experience Platforms",   "AEM, Sitecore, DXP authoring and development");
  const catAnalytics= await upsertCategory("Analytics & Marketing",          "Adobe Analytics, measurement, tagging");
  const catMobile   = await upsertCategory("Mobile Development",             "Android and iOS native development");

  // ══════════════════════════════════════════════════════════════════════════
  // SKILLS
  // ══════════════════════════════════════════════════════════════════════════
  const skillJS     = await upsertSkill("JS001",  "JavaScript",       "Core JavaScript language skills");
  const skillTS     = await upsertSkill("TS001",  "TypeScript",       "TypeScript type system and tooling");
  const skillReact  = await upsertSkill("FE001",  "React",            "React component model and hooks");
  const skillNode   = await upsertSkill("BE001",  "Node.js",          "Server-side JavaScript with Node");
  const skillSQL    = await upsertSkill("DB001",  "SQL",              "Relational database querying");
  const skillDocker = await upsertSkill("DO001",  "Docker",           "Containerisation with Docker");
  const skillAWS    = await upsertSkill("CL001",  "AWS Fundamentals", "Core AWS services and concepts");
  const skillAC     = await upsertSkill("AC001",  "Adobe Commerce",   "Adobe Commerce (Magento) development, GraphQL, PWA");
  const skillCT     = await upsertSkill("CT001",  "commercetools",    "commercetools Composable Commerce API-first platform");
  const skillAEM    = await upsertSkill("AEM001", "Adobe Experience Manager", "AEM as a Cloud Service, Content Fragments, headless");
  const skillCF     = await upsertSkill("CF001",  "Contentful",       "Contentful headless CMS, content modeling, GraphQL API");
  const skillCS     = await upsertSkill("CS001",  "Contentstack",     "Contentstack headless CMS, stacks, Modular Blocks");
  const skillAA     = await upsertSkill("AA001",  "Adobe Analytics",  "Adobe Analytics implementation, tags, eVars, props");
  const skillSC     = await upsertSkill("SC001",  "Sitecore XM Cloud","Sitecore XM Cloud, Content SDK, Next.js headless");
  const skillAND    = await upsertSkill("AND001", "Android",          "Android development with Kotlin and Jetpack Compose");
  const skillIOS    = await upsertSkill("IOS001", "iOS / SwiftUI",    "iOS development with Swift and SwiftUI");

  // ══════════════════════════════════════════════════════════════════════════
  // SKILL ROLES
  // ══════════════════════════════════════════════════════════════════════════
  // JS
  const jsAssoc  = await upsertSkillRole(skillJS.id,  "ASSOC",     "Associate Developer",    1, { easy:3,medium:2,hard:0 });
  const jsSr     = await upsertSkillRole(skillJS.id,  "SR_DEV",    "Senior Developer",       2, { easy:1,medium:3,hard:2 });
  const jsTL     = await upsertSkillRole(skillJS.id,  "TECH_LEAD", "Technical Lead",         3, { easy:0,medium:2,hard:3 });
  // TS
  const tsAssoc  = await upsertSkillRole(skillTS.id,  "ASSOC",     "Associate Developer",    1, { easy:2,medium:2,hard:1 });
  const tsSr     = await upsertSkillRole(skillTS.id,  "SR_DEV",    "Senior Developer",       2, { easy:1,medium:2,hard:3 });
  // React
  const reactAssoc = await upsertSkillRole(skillReact.id, "ASSOC",  "Associate Developer",  1, { easy:2,medium:2,hard:1 });
  const reactSr    = await upsertSkillRole(skillReact.id, "SR_DEV", "Senior Developer",     2, { easy:1,medium:2,hard:2 });
  // Node
  const nodeAssoc  = await upsertSkillRole(skillNode.id,  "ASSOC",  "Associate Developer",  1, { easy:2,medium:2,hard:1 });
  const nodeSr     = await upsertSkillRole(skillNode.id,  "SR_DEV", "Senior Developer",     2, { easy:1,medium:2,hard:2 });
  // SQL
  const sqlAssoc   = await upsertSkillRole(skillSQL.id,  "ASSOC",   "Data Analyst",          1, { easy:2,medium:2,hard:1 });
  const sqlSr      = await upsertSkillRole(skillSQL.id,  "SR_ENG",  "Senior Data Engineer",  2, { easy:1,medium:2,hard:2 });
  // Docker
  const dockerDev  = await upsertSkillRole(skillDocker.id, "DEV",       "Developer",           1, { easy:2,medium:2,hard:1 });
  const dockerSr   = await upsertSkillRole(skillDocker.id, "SR_DEVOPS", "Senior DevOps Eng",   2, { easy:1,medium:2,hard:2 });
  // AWS
  const awsEng     = await upsertSkillRole(skillAWS.id, "CLOUD_ENG",  "Cloud Engineer",       1, { easy:2,medium:2,hard:1 });
  const awsArch    = await upsertSkillRole(skillAWS.id, "ARCH",       "Cloud Architect",      2, { easy:1,medium:2,hard:2 });

  // Adobe Commerce
  const acDev      = await upsertSkillRole(skillAC.id, "DEV",    "Developer",              1, { easy:2,medium:2,hard:1 });
  const acSrDev    = await upsertSkillRole(skillAC.id, "SR_DEV", "Senior Developer",       2, { easy:1,medium:2,hard:2 });
  const acArch     = await upsertSkillRole(skillAC.id, "ARCH",   "Solution Architect",     3, { easy:0,medium:2,hard:3 });

  // commercetools
  const ctDev      = await upsertSkillRole(skillCT.id, "DEV",    "Developer",              1, { easy:2,medium:2,hard:1 });
  const ctSrDev    = await upsertSkillRole(skillCT.id, "SR_DEV", "Senior Developer",       2, { easy:1,medium:2,hard:2 });

  // AEM
  const aemDev      = await upsertSkillRole(skillAEM.id, "DEV",     "Developer",            1, { easy:2,medium:2,hard:1 });
  const aemSrDev    = await upsertSkillRole(skillAEM.id, "SR_DEV",  "Senior Developer",     2, { easy:1,medium:2,hard:2 });
  const aemAuthor   = await upsertSkillRole(skillAEM.id, "AUTHOR",  "Content Author",       3, { easy:3,medium:2,hard:0 });

  // Contentful
  const cfDev       = await upsertSkillRole(skillCF.id, "DEV",    "Developer",              1, { easy:2,medium:2,hard:1 });
  const cfAuthor    = await upsertSkillRole(skillCF.id, "AUTHOR", "Content Author",         2, { easy:3,medium:2,hard:0 });

  // Contentstack
  const csDev       = await upsertSkillRole(skillCS.id, "DEV",    "Developer",              1, { easy:2,medium:2,hard:1 });
  const csAuthor    = await upsertSkillRole(skillCS.id, "AUTHOR", "Content Author",         2, { easy:3,medium:2,hard:0 });

  // Adobe Analytics
  const aaAnalyst   = await upsertSkillRole(skillAA.id, "ANALYST",    "Implementation Analyst",  1, { easy:2,medium:2,hard:1 });
  const aaSrAnalyst = await upsertSkillRole(skillAA.id, "SR_ANALYST", "Senior Analytics Eng",    2, { easy:1,medium:2,hard:2 });

  // Sitecore
  const scDev       = await upsertSkillRole(skillSC.id, "DEV",    "Developer",              1, { easy:2,medium:2,hard:1 });
  const scSrDev     = await upsertSkillRole(skillSC.id, "SR_DEV", "Senior Developer",       2, { easy:1,medium:2,hard:2 });

  // Android
  const andDev      = await upsertSkillRole(skillAND.id, "DEV",    "Developer",             1, { easy:2,medium:2,hard:1 });
  const andSrDev    = await upsertSkillRole(skillAND.id, "SR_DEV", "Senior Developer",      2, { easy:1,medium:2,hard:2 });

  // iOS
  const iosDev      = await upsertSkillRole(skillIOS.id, "DEV",    "Developer",             1, { easy:2,medium:2,hard:1 });
  const iosSrDev    = await upsertSkillRole(skillIOS.id, "SR_DEV", "Senior Developer",      2, { easy:1,medium:2,hard:2 });

  // ══════════════════════════════════════════════════════════════════════════
  // TOPICS
  // ══════════════════════════════════════════════════════════════════════════
  const topicJSBasics  = await upsertTopic(catProg.id,  "JavaScript Basics",             "ES6+ fundamentals, types, closures");
  const topicJSAsync   = await upsertTopic(catProg.id,  "JavaScript Async",              "Promises, async/await, event loop");
  const topicTS        = await upsertTopic(catProg.id,  "TypeScript Fundamentals",       "Types, interfaces, generics");
  const topicReact     = await upsertTopic(catProg.id,  "React Development",             "Components, hooks, state management");
  const topicNodeAPI   = await upsertTopic(catProg.id,  "Node.js APIs",                  "Express, REST design, middleware");
  const topicSQL       = await upsertTopic(catData.id,  "SQL & Relational DBs",          "Queries, joins, transactions", 65);
  const topicDocker    = await upsertTopic(catCloud.id, "Docker Basics",                 "Images, containers, Compose");
  const topicAWS       = await upsertTopic(catCloud.id, "AWS Fundamentals",              "EC2, S3, IAM, networking", 65);
  const topicACDev     = await upsertTopic(catEcom.id,  "Adobe Commerce Development",    "Module system, DI, plugins, PHP 8.4+, GraphQL, 2.4.x", 65);
  const topicCTFund    = await upsertTopic(catEcom.id,  "commercetools Fundamentals",    "API-first, Projects, Types, Extensions, SDKs");
  const topicAEMDev    = await upsertTopic(catDXP.id,   "AEM as Cloud Service Dev",      "Content Fragments, GraphQL API, headless delivery", 65);
  const topicAEMAuth   = await upsertTopic(catDXP.id,   "AEM Content Authoring",         "Content Fragment editor, variations, workflows");
  const topicCFDev     = await upsertTopic(catCMS.id,   "Contentful Development",        "Content Delivery/Management/GraphQL APIs, environments");
  const topicCFAuth    = await upsertTopic(catCMS.id,   "Contentful Content Modeling",   "Spaces, content types, fields, rich text");
  const topicCSDev     = await upsertTopic(catCMS.id,   "Contentstack Development",      "Stacks, Delivery/Preview/Management APIs, branches");
  const topicCSAuth    = await upsertTopic(catCMS.id,   "Contentstack Content Authoring","Entries, Modular Blocks, Live Preview, publishing");
  const topicAAImpl    = await upsertTopic(catAnalytics.id,"Adobe Analytics Implementation","Tags/AEP, report suites, eVars, props, Web SDK", 65);
  const topicSCDev     = await upsertTopic(catDXP.id,   "Sitecore XM Cloud Development", "Content SDK, Next.js, SitecoreClient, headless", 65);
  const topicAND       = await upsertTopic(catMobile.id,"Android with Jetpack Compose",  "Compose UI, MVVM, StateFlow, Coroutines, Material 3", 65);
  const topicIOS       = await upsertTopic(catMobile.id,"iOS with SwiftUI",              "SwiftUI, Liquid Glass, SwiftData, Swift 6, WWDC25", 65);

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — existing JS / TS / React / Node / SQL / Docker / AWS
  // ══════════════════════════════════════════════════════════════════════════
  // JavaScript Basics
  await q(topicJSBasics.id,skillJS.id,[jsAssoc.id,jsSr.id],"easy","What is the output of typeof null?",["null","undefined","object","string"],2,"typeof null returns 'object' due to a historical bug in JavaScript.");
  await q(topicJSBasics.id,skillJS.id,[jsAssoc.id,jsSr.id],"medium","Which of the following are block-scoped variable declarations in JavaScript?",["var","let","const","function"],[1,2],"Both let and const are block-scoped; var is function-scoped.","multi");
  const blockScopedReassignStem =
    "Which keyword declares a block-scoped variable that can be reassigned?";
  await q(
    topicJSBasics.id,
    skillJS.id,
    [jsAssoc.id, jsSr.id],
    "easy",
    blockScopedReassignStem,
    ["var", "let", "const", "function"],
    1,
    "let is block-scoped and reassignable; const is block-scoped but not reassignable; var is function-scoped."
  );
  // Retire overlapping single-select wording (same topic as multi-select below)
  const legacyBlockScoped = await prisma.question.findFirst({
    where: {
      topicId: topicJSBasics.id,
      skillId: skillJS.id,
      stem: "Which keyword declares a block-scoped variable?",
    },
  });
  if (legacyBlockScoped && legacyBlockScoped.id) {
    await prisma.question.update({
      where: { id: legacyBlockScoped.id },
      data: {
        stem: blockScopedReassignStem,
        correctIndices: [1],
        explanation:
          "let is block-scoped and reassignable; const is block-scoped but not reassignable; var is function-scoped.",
      },
    });
  }
  const reassignDupes = await prisma.question.findMany({
    where: { topicId: topicJSBasics.id, skillId: skillJS.id, stem: blockScopedReassignStem },
    orderBy: { createdAt: "asc" },
  });
  if (reassignDupes.length > 1) {
    const [, ...drop] = reassignDupes;
    for (const d of drop) {
      await prisma.questionSkillRole.deleteMany({ where: { questionId: d.id } });
      await prisma.attemptAnswer.deleteMany({ where: { questionId: d.id } });
      await prisma.question.delete({ where: { id: d.id } });
    }
  }
  await q(topicJSBasics.id,skillJS.id,[jsAssoc.id,jsSr.id],"easy","Which method adds an element to the end of an array?",["push()","pop()","shift()","unshift()"],0);
  await q(topicJSBasics.id,skillJS.id,jsAssoc.id,"medium","What does === check compared to ==?",["Only value","Value and type","Reference only","Type only"],1,"=== is strict equality: it checks both value and type without coercion.");
  await q(topicJSBasics.id,skillJS.id,jsAssoc.id,"medium","Which of these is a falsy value in JavaScript?",["'false'","[]","0","{}"],2);
  await q(topicJSBasics.id,skillJS.id,[jsSr.id,jsTL.id],"easy","What is a closure in JavaScript?",["A function that returns another function","A function with access to its outer scope variables","An IIFE pattern","A class method"],1);
  await q(topicJSBasics.id,skillJS.id,[jsSr.id,jsTL.id],"medium","What does Array.prototype.reduce do?",["Filters elements","Maps to new array","Accumulates a single result","Finds an element"],2);
  await q(topicJSBasics.id,skillJS.id,[jsSr.id,jsTL.id],"medium","What is the difference between null and undefined?",["They are the same","null is intentional absence; undefined is uninitialized","undefined is assigned; null is default","null is a type; undefined is a value"],1);
  await q(topicJSBasics.id,skillJS.id,jsSr.id,"medium","What will console.log(1 + '2' + 3) output?",["6","'123'","123","NaN"],1,"Type coercion: 1+'2'='12' (string), '12'+3='123'.");
  await q(topicJSBasics.id,skillJS.id,jsSr.id,"hard","What is the output of [1,2,3].map(parseInt)?",["[1,2,3]","[1,NaN,NaN]","[1,NaN,undefined]","Error"],1,"parseInt receives (value, index, array) — the index is used as radix, giving NaN for radix 1 and 2.");
  await q(topicJSBasics.id,skillJS.id,jsSr.id,"hard","What does Object.freeze() do?",["Deep-freezes all nested objects","Makes top-level properties immutable; nested objects are still mutable","Prevents adding new properties only","Converts to a primitive"],1);
  await q(topicJSBasics.id,skillJS.id,jsTL.id,"medium","What is the event loop responsible for?",["Memory management","DOM updates only","Executing queued callbacks after the call stack is empty","Garbage collection"],2);
  await q(topicJSBasics.id,skillJS.id,jsTL.id,"hard","What does the Symbol primitive type provide?",["Faster string comparisons","Unique and immutable identifiers used as property keys","A way to define constants","A replacement for enums"],1);
  await q(topicJSBasics.id,skillJS.id,jsTL.id,"hard","What is WeakRef and why is it useful?",["A strong reference variant","A reference that does not prevent garbage collection of its target","A reference to a Web Worker","A deprecated Reflect API"],1);
  // JS Async
  await q(topicJSAsync.id,skillJS.id,[jsAssoc.id,jsSr.id],"easy","What does a Promise represent?",["A callback function","An eventual value or error","An observable stream","A synchronous result"],1);
  await q(topicJSAsync.id,skillJS.id,[jsAssoc.id,jsSr.id],"easy","Which keyword waits for a Promise inside an async function?",["wait","pause","await","defer"],2);
  await q(topicJSAsync.id,skillJS.id,jsAssoc.id,"medium","When does Promise.all reject?",["When all promises reject","When any single promise rejects","Never","When more than half reject"],1,"Promise.all short-circuits on the first rejection.");
  await q(topicJSAsync.id,skillJS.id,jsAssoc.id,"medium","What is the purpose of Promise.allSettled?",["Waits for fulfilled only","Waits for all regardless of outcome","Rejects on first failure","Same as Promise.all"],1);
  await q(topicJSAsync.id,skillJS.id,[jsSr.id,jsTL.id],"easy","What is the microtask queue?",["Queue for setTimeout callbacks","High-priority queue drained before each macrotask","Queue for network requests","Same as the call stack"],1);
  await q(topicJSAsync.id,skillJS.id,jsSr.id,"medium","What is Promise.race?",["Returns all results","Resolves/rejects with the first settled promise","Runs in sequence","Retries on failure"],1);
  await q(topicJSAsync.id,skillJS.id,jsSr.id,"hard","How can you cancel an in-flight fetch request?",["clearTimeout","AbortController and AbortSignal","fetch cannot be cancelled","Promise.race only"],1);
  await q(topicJSAsync.id,skillJS.id,jsTL.id,"medium","What is structured concurrency?",["Sequential tasks","Grouping async tasks with a shared lifetime and error propagation","A Web Workers feature","Same as Promise.all"],1);
  await q(topicJSAsync.id,skillJS.id,jsTL.id,"hard","What is backpressure in async streams?",["Sync code overflow","Producer generating data faster than consumer can handle","A retry strategy","A rendering concept"],1);
  await q(topicJSAsync.id,skillJS.id,[jsSr.id,jsTL.id],"medium","Which of the following are Promise static methods in JavaScript?",["Promise.all","Promise.race","Promise.map","Promise.allSettled"],[0,1,3],"Promise.all, Promise.race, and Promise.allSettled are built-in; Promise.map does not exist.","multi");
  // TypeScript
  await q(topicTS.id,skillTS.id,tsAssoc.id,"easy","What is TypeScript?",["A CSS framework","A superset of JavaScript with static typing","A JS runtime","A bundler"],1);
  await q(topicTS.id,skillTS.id,tsAssoc.id,"easy","Which keyword defines a named type alias?",["interface","type","class","enum"],1);
  await q(topicTS.id,skillTS.id,tsAssoc.id,"medium","What does the 'unknown' type mean?",["Same as any","Type must be narrowed before use","A compile error","Object without properties"],1);
  await q(topicTS.id,skillTS.id,tsAssoc.id,"medium","What is the key difference between interface and type alias?",["Identical","Interfaces can be declaration-merged; type aliases cannot","Type aliases support generics","Interfaces are faster"],1);
  await q(topicTS.id,skillTS.id,tsAssoc.id,"hard","What is a mapped type in TypeScript?",["A type for Map<K,V>","A type that transforms all keys of another type","A generic constraint","A decorator type"],1);
  await q(topicTS.id,skillTS.id,tsSr.id,"easy","What does the 'never' type represent?",["An empty value","A type that can never be instantiated","Same as void","Uninitialized variables"],1);
  await q(topicTS.id,skillTS.id,tsSr.id,"medium","What is a discriminated union?",["A union with no overlap","A union where a common literal field narrows the type","A set of interfaces","Exclusive enum values"],1);
  await q(topicTS.id,skillTS.id,tsSr.id,"medium","What does the infer keyword do inside a conditional type?",["Runtime inference","Captures a type variable inside a conditional type expression","Equivalent to typeof","Resolves generics eagerly"],1);
  await q(topicTS.id,skillTS.id,tsSr.id,"hard","What does Exclude<T, U> do?",["Removes optional from keys","Constructs T excluding union members assignable to U","Makes all keys required","A runtime type guard"],1);
  await q(topicTS.id,skillTS.id,tsSr.id,"hard","What are template literal types?",["HTML templating","Creating string types by combining literal types","Runtime interpolation","CSS-in-TS"],1);
  await q(topicTS.id,skillTS.id,[tsAssoc.id,tsSr.id],"medium","Which of the following are TypeScript primitive types?",["string","number","object","boolean","array"],[0,1,3],"string, number, and boolean are primitives; object and array are not.","multi");
  // React
  await q(topicReact.id,skillReact.id,reactAssoc.id,"easy","What hook manages local component state?",["useEffect","useRef","useState","useReducer"],2);
  await q(topicReact.id,skillReact.id,reactAssoc.id,"easy","What does JSX stand for?",["JavaScript XML","Java Syntax Extension","JSON XML","JavaScript XQuery"],0);
  await q(topicReact.id,skillReact.id,reactAssoc.id,"medium","What is the purpose of useEffect's dependency array?",["Prevents re-renders","Controls when the effect re-runs","Memoizes the component","Replaces componentDidMount"],1);
  await q(topicReact.id,skillReact.id,reactAssoc.id,"medium","What does React.memo do?",["Memoizes return value","Prevents re-render if props haven't changed","Caches API results","Defers rendering"],1);
  await q(topicReact.id,skillReact.id,reactSr.id,"easy","What problem does useCallback solve?",["Async bugs","New function references each render causing child re-renders","Cancels effects","Batches state updates"],1);
  await q(topicReact.id,skillReact.id,reactSr.id,"medium","What is reconciliation in React?",["Merging form data","The diff algorithm React uses to update only changed DOM nodes","Syncing with backend","Handling errors"],1);
  await q(topicReact.id,skillReact.id,reactSr.id,"hard","What is concurrent rendering in React 18+?",["Multi-threaded rendering","Ability to interrupt and resume rendering for responsiveness","SSR","Lazy loading"],1);
  await q(topicReact.id,skillReact.id,[reactAssoc.id,reactSr.id],"medium","Which of the following are built-in React hooks?",["useState","useEffect","useComponent","useMemo"],[0,1,3],"useState, useEffect, and useMemo are built-in hooks; useComponent is not.","multi");
  // Node
  await q(topicNodeAPI.id,skillNode.id,nodeAssoc.id,"easy","What HTTP status code means 'resource created'?",["200","201","204","301"],1);
  await q(topicNodeAPI.id,skillNode.id,nodeAssoc.id,"easy","What is middleware in Express?",["A DB helper","A function with req, res, and next","A route definition","An error code"],1);
  await q(topicNodeAPI.id,skillNode.id,nodeAssoc.id,"medium","What does app.use() do in Express?",["Single route","Mounts middleware for all routes or a path prefix","Starts server","Connects DB"],1);
  await q(topicNodeAPI.id,skillNode.id,nodeSr.id,"easy","Which Node.js module provides low-level HTTP?",["fs","path","http","net"],2);
  await q(topicNodeAPI.id,skillNode.id,nodeSr.id,"medium","What is process.nextTick() used for?",["Delay 1s","Schedule callback before next I/O event in the event loop","Async file read","Same as setTimeout 0"],1);
  await q(topicNodeAPI.id,skillNode.id,nodeSr.id,"hard","What is the Worker Threads module used for?",["Multi-process spawn","CPU-intensive tasks in parallel threads without blocking","Cluster load balancing","Async I/O"],1);
  await q(topicNodeAPI.id,skillNode.id,[nodeAssoc.id,nodeSr.id],"medium","Which HTTP status codes indicate a successful response?",["200 OK","201 Created","404 Not Found","204 No Content"],[0,1,3],"200, 201, and 204 are success codes; 404 is a client error.","multi");
  // SQL
  await q(topicSQL.id,skillSQL.id,sqlAssoc.id,"easy","Which SQL clause filters rows?",["GROUP BY","ORDER BY","WHERE","HAVING"],2);
  await q(topicSQL.id,skillSQL.id,sqlAssoc.id,"easy","What does SELECT DISTINCT do?",["Count unique rows","Return unique rows","Delete duplicates","Sort rows"],1);
  await q(topicSQL.id,skillSQL.id,sqlAssoc.id,"medium","What type of JOIN returns all rows from both tables including non-matching?",["INNER JOIN","LEFT JOIN","FULL OUTER JOIN","CROSS JOIN"],2);
  await q(topicSQL.id,skillSQL.id,sqlAssoc.id,"medium","Difference between WHERE and HAVING?",["No difference","WHERE filters before aggregation; HAVING after","HAVING is faster","WHERE works on grouped data"],1);
  await q(topicSQL.id,skillSQL.id,sqlSr.id,"easy","What does an index do in a relational DB?",["Compresses data","Speeds up lookups at the cost of write overhead","Enforces uniqueness only","Replaces PKs"],1);
  await q(topicSQL.id,skillSQL.id,sqlSr.id,"medium","What is a CTE?",["A trigger type","A temporary named result set defined with WITH","A composite index","A foreign key type"],1);
  await q(topicSQL.id,skillSQL.id,sqlSr.id,"hard","What is a window function?",["Opens a connection","Computes values across rows related to the current row without collapsing groups","A stored procedure","A view"],1);
  await q(topicSQL.id,skillSQL.id,[sqlAssoc.id,sqlSr.id],"medium","Which SQL statements modify data in a table?",["SELECT","INSERT","UPDATE","DELETE"],[1,2,3],"INSERT, UPDATE, and DELETE are DML; SELECT reads data only.","multi");
  // Docker
  await q(topicDocker.id,skillDocker.id,dockerDev.id,"easy","What is a Docker image?",["Running container","Read-only template for creating containers","Virtual machine","Network namespace"],1);
  await q(topicDocker.id,skillDocker.id,dockerDev.id,"easy","Which command builds a Docker image?",["docker run","docker build","docker start","docker create"],1);
  await q(topicDocker.id,skillDocker.id,dockerDev.id,"medium","What does docker-compose do?",["Builds images only","Manages multi-container apps defined in YAML","Pushes to Hub","Creates Dockerfiles"],1);
  await q(topicDocker.id,skillDocker.id,dockerSr.id,"medium","Difference between CMD and ENTRYPOINT?",["Same","ENTRYPOINT sets executable; CMD provides default arguments","CMD runs at build time","ENTRYPOINT sets env vars"],1);
  await q(topicDocker.id,skillDocker.id,dockerSr.id,"hard","What is a multi-stage Docker build?",["Multiple FROM statements to keep final image small","Running multiple containers","Multi-platform build","Multiple Dockerfiles"],0);
  // AWS
  await q(topicAWS.id,skillAWS.id,awsEng.id,"easy","What does EC2 stand for?",["Elastic Cloud Compute","Elastic Compute Cloud","Enterprise Cloud Container","Elastic Container Cluster"],1);
  await q(topicAWS.id,skillAWS.id,awsEng.id,"easy","What is Amazon S3 primarily used for?",["Virtual machines","Object/blob storage","Relational databases","DNS"],1);
  await q(topicAWS.id,skillAWS.id,awsEng.id,"medium","What is an IAM Role?",["Billing management","Grants AWS service permissions without sharing credentials","Creates VPCs","DNS"],1);
  await q(topicAWS.id,skillAWS.id,awsArch.id,"medium","What is an AWS VPC?",["Container registry","Isolated virtual network within AWS","Autoscaling group","API gateway"],1);
  await q(topicAWS.id,skillAWS.id,awsArch.id,"hard","Difference between security group and NACL?",["Identical","Security groups are stateful instance-level; NACLs are stateless subnet-level","NACLs are faster","Security groups at subnet level"],1);

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — Adobe Commerce (based on 2.4.8/2.4.9 release notes, developer.adobe.com)
  // ══════════════════════════════════════════════════════════════════════════
  // Developer (associate-level)
  await q(topicACDev.id,skillAC.id,[acDev.id,acSrDev.id],"easy","What is the current stable release line of Adobe Commerce as of 2026?",["2.3.x","2.4.x","2.5.x","3.0.x"],1,"Adobe Commerce 2.4.9 was released May 2026; the 2.4.x line is the current stable series.");
  await q(topicACDev.id,skillAC.id,[acDev.id,acSrDev.id],"easy","Which PHP version is supported in Adobe Commerce 2.4.8?",["PHP 7.4","PHP 8.1","PHP 8.4","PHP 9.0"],2,"Adobe Commerce 2.4.8 introduced native PHP 8.4 support.");
  await q(topicACDev.id,skillAC.id,[acDev.id,acSrDev.id],"easy","What are Observer, Plugin, and Preference in Adobe Commerce?",["CSS frameworks","Three ways to extend or intercept module behaviour","Database tools","Frontend rendering engines"],1,"Plugins intercept public methods, Observers react to events, Preferences replace implementations.");
  await q(topicACDev.id,skillAC.id,acDev.id,"medium","What replaced Zend_Cache in Adobe Commerce 2.4.9?",["Redis directly","symfony/cache","Laminas\\Cache","PSR-16"],1,"2.4.9 introduced a backward-incompatible change replacing Zend_Cache with symfony/cache.");
  await q(topicACDev.id,skillAC.id,acDev.id,"medium","What does the ApplicationServer module (Swoole) do in Adobe Commerce 2.4.7+?",["Runs cron jobs","Maintains state between GraphQL requests, reducing response time by 50–60ms","Replaces the MySQL adapter","Powers PWA Studio"],1,"The ApplicationServer module enables state sharing between processes, eliminating repeated bootstrapping for each request.");
  await q(topicACDev.id,skillAC.id,[acDev.id,acSrDev.id],"medium","What new GraphQL feature was introduced in Adobe Commerce 2.4.9 for cart management?",["addProductsToCart","clearCart mutation (now available in Magento Open Source)","removeItemFromCart","createGuestCart"],1,"The clearCart GraphQL mutation was previously Adobe Commerce-only and was made available in Magento Open Source in 2.4.9.");
  await q(topicACDev.id,skillAC.id,acSrDev.id,"medium","What is PWA Studio in Adobe Commerce?",["A PHP templating engine","A set of React+GraphQL tools for building headless storefronts","A B2B module","A payment gateway"],1,"PWA Studio is a React + GraphQL toolkit for building headless storefronts. Adobe's strategic investment has shifted to Edge Delivery Services as of 2026.");
  await q(topicACDev.id,skillAC.id,acSrDev.id,"hard","What is the purpose of Dependency Injection (DI) in Adobe Commerce?",["Caching mechanism","A design pattern where object dependencies are passed via constructor, enabling testability and modularity","Routing system","Frontend theming"],1,"Adobe Commerce uses Magento's DI framework (configured via di.xml) to wire components together without tight coupling.");
  await q(topicACDev.id,skillAC.id,acSrDev.id,"hard","What security enforcement was added to REST and GraphQL APIs in Adobe Commerce 2.4.9?",["OAuth 2.0 only","CAPTCHA/reCAPTCHA validation on API endpoints","IP whitelisting","2FA for every request"],1,"2.4.9 added CAPTCHA enforcement on REST and GraphQL APIs when CAPTCHA is enabled in configuration.");
  await q(topicACDev.id,skillAC.id,acArch.id,"hard","What is the recommended headless storefront approach for new Adobe Commerce projects in 2026?",["PWA Studio (Venia)","Luma theme","Edge Delivery Services — Adobe's actively invested path","Hyva theme"],2,"While PWA Studio and Luma are still supported, Adobe's active investment is in Edge Delivery Services for new headless implementations as of 2026.");
  await q(topicACDev.id,skillAC.id,acArch.id,"hard","How does multi-source inventory (MSI) affect stock management in Adobe Commerce?",["Single warehouse only","Enables assigning inventory to multiple physical sources and deducting from the closest or configured source","Replaces the simple product type","Is only for B2B"],1);
  await q(topicACDev.id,skillAC.id,acArch.id,"medium","What does GraphQL alias limit validation in Adobe Commerce 2.4.9 prevent?",["Slow queries","Denial-of-service attacks from oversized or alias-abusing GraphQL queries","Unauthorised mutations","Cache invalidation"],1,"2.4.9 introduced alias limit and query length validation to prevent service disruption from malformed GraphQL.");
  await q(topicACDev.id,skillAC.id,[acDev.id,acSrDev.id],"medium","Which are valid Adobe Commerce extension mechanisms?",["Plugins (interceptors)","Observers (event listeners)","Preferences (class substitution)","Direct core file edits"],[0,1,2],"Plugins, Observers, and Preferences are supported; editing core files is discouraged.","multi");

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — commercetools (based on official docs.commercetools.com, 2025)
  // ══════════════════════════════════════════════════════════════════════════
  await q(topicCTFund.id,skillCT.id,[ctDev.id,ctSrDev.id],"easy","In commercetools, what is a Project?",["A Git repository","A secure, isolated container holding all commerce data including products, customers, and orders","A deployment pipeline","A team workspace"],1,"A Project is the top-level data container in commercetools; all resources (products, carts, customers) live inside it.");
  await q(topicCTFund.id,skillCT.id,[ctDev.id,ctSrDev.id],"easy","What is the primary API style of commercetools?",["SOAP only","RESTful HTTP APIs with over 500 endpoints, plus full GraphQL support","WebSockets only","gRPC"],1,"commercetools is API-first with 500+ REST APIs and full GraphQL coverage.");
  await q(topicCTFund.id,skillCT.id,[ctDev.id,ctSrDev.id],"easy","Which authentication mechanism is used to call commercetools APIs?",["Basic Auth","API Keys in headers","Bearer tokens obtained from API clients via OAuth 2.0 client credentials","Session cookies"],2,"Access tokens are generated from API clients using OAuth 2.0 client credentials flow.");
  await q(topicCTFund.id,skillCT.id,ctDev.id,"medium","What are Custom Types and Custom Fields in commercetools used for?",["Replacing built-in resources","Adding extra fields to existing resources without creating new ones","Defining product schemas","Setting pricing rules"],1,"Custom Types allow you to extend any existing commercetools resource with additional structured data.");
  await q(topicCTFund.id,skillCT.id,ctDev.id,"medium","What is an API Extension in commercetools?",["A CLI plugin","A mechanism to intercept and augment API requests/responses with custom business logic via HTTP","A frontend widget","A report generator"],1,"API Extensions call an external HTTP service before or after a specific commercetools API action, enabling custom validation or enrichment.");
  await q(topicCTFund.id,skillCT.id,ctDev.id,"medium","What is a Subscription in commercetools?",["A recurring billing feature","A mechanism to publish messages about resource changes to a message queue or serverless function","An event calendar","A product bundle"],1,"Subscriptions push messages about state changes to AWS SQS, Azure Service Bus, Google Pub/Sub, or other endpoints.");
  await q(topicCTFund.id,skillCT.id,[ctDev.id,ctSrDev.id],"medium","Which SDKs are officially available for commercetools?",["Python, Ruby, Go","Java, TypeScript, PHP, and .NET","Swift, Kotlin, Dart","Shell script only"],1);
  await q(topicCTFund.id,skillCT.id,ctSrDev.id,"hard","What is reference expansion in commercetools, and why is it used?",["A caching strategy","Resolving referenced resources (e.g. customer, product) in a single API response to reduce round-trips","A way to filter fields","A schema validation feature"],1);
  await q(topicCTFund.id,skillCT.id,ctSrDev.id,"hard","What is the purpose of States in commercetools?",["User permissions","Modelling lifecycles (e.g. order states) with allowed transitions enforced by the platform","Custom field types","Inventory locations"],1,"States allow you to define custom state machines for resources like Orders and Line Items with enforced transitions.");
  await q(topicCTFund.id,skillCT.id,ctSrDev.id,"hard","What is Commerce MCP introduced by commercetools?",["A mobile app framework","An AI agent interface enabling LLMs and SaaS applications to interact with commercetools functionality","A CI/CD tool","A payment module"],1,"Commerce MCP (Model Context Protocol) is commercetools' AI agent interface; Developer MCP makes API docs accessible to IDEs and AI assistants.");
  await q(topicCTFund.id,skillCT.id,ctSrDev.id,"medium","What was added to the Composable Commerce SDKs in October 2025?",["GraphQL subscriptions","Support for the Checkout API in Java, TypeScript, and .NET SDKs","Bulk import utilities","Webhooks SDK"],1);
  await q(topicCTFund.id,skillCT.id,[ctDev.id,ctSrDev.id],"medium","Which languages have officially supported commercetools SDKs?",["Java","TypeScript","PHP","Ruby"],[0,1,2],"Official SDKs include Java, TypeScript, PHP, and .NET; Ruby is not listed.","multi");

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — AEM as a Cloud Service (based on experienceleague.adobe.com, 2025)
  // ══════════════════════════════════════════════════════════════════════════
  // Developer
  await q(topicAEMDev.id,skillAEM.id,[aemDev.id,aemSrDev.id],"easy","What is a Content Fragment in AEM?",["A page layout component","A piece of structured, channel-neutral content based on a Content Fragment Model","A media asset","A site template"],1,"Content Fragments are editorial, structured content stored in the DAM, not tied to any page.");
  await q(topicAEMDev.id,skillAEM.id,[aemDev.id,aemSrDev.id],"easy","Where are Content Fragments stored in AEM?",["Under /content/sites","In the JCR under /content/dam","In a separate SQL database","In a CDN"],1,"Content Fragments are stored in AEM Assets (/content/dam) and managed like other digital assets.");
  await q(topicAEMDev.id,skillAEM.id,[aemDev.id,aemSrDev.id],"easy","What defines the structure of a Content Fragment?",["A Sling Model","A Content Fragment Model","A Page Template","An OSGi configuration"],1,"A Content Fragment Model acts as the schema; it defines which fields authors can fill in when creating a fragment.");
  await q(topicAEMDev.id,skillAEM.id,aemDev.id,"medium","How are Content Fragments delivered headlessly in AEM?",["Via server-side JSP rendering","Via the AEM GraphQL API or the Content Fragment Delivery OpenAPI","Via AEM Dispatcher only","Via email export"],1,"AEM provides a customised GraphQL API and a newer REST-based Content Fragment Delivery OpenAPI for headless delivery.");
  await q(topicAEMDev.id,skillAEM.id,aemDev.id,"medium","What is the Content Fragment Delivery OpenAPI (introduced in AEM as Cloud Service)?",["A SOAP service","A REST-based delivery alternative optimised for CDN caching, performance, and automatic hydration of nested fragment references","A GraphQL wrapper","A Sling servlet"],1);
  await q(topicAEMDev.id,skillAEM.id,aemDev.id,"medium","What is a Fragment Reference field in a Content Fragment Model used for?",["Embedding binary files","Creating a relationship to another Content Fragment, enabling nested structures","Storing rich text","Defining metadata"],1);
  await q(topicAEMDev.id,skillAEM.id,aemSrDev.id,"hard","What is the difference between Content Fragments and Experience Fragments in AEM?",["They are identical","Content Fragments are structured editorial content without layout; Experience Fragments are fully laid-out page sections","Experience Fragments are stored in DAM","Content Fragments require JSX"],1);
  await q(topicAEMDev.id,skillAEM.id,aemSrDev.id,"hard","What is the role of the Content Fragment Core Component in AEM page authoring?",["Generates GraphQL schemas","Embeds a Content Fragment into an AEM Sites page, rendering it as HTML or JSON","Manages DAM folder permissions","Runs AEM workflows"],1);
  await q(topicAEMDev.id,skillAEM.id,aemSrDev.id,"hard","In AEM's GraphQL API, how do you query all Content Fragments of a specific model type?",["Use a Sling Model REST endpoint","Use a model-specific query generated automatically from the Content Fragment Model name, e.g. articleList or articleByPath","Call a JCR SQL query","Use the DAM search API"],1);
  await q(topicAEMDev.id,skillAEM.id,[aemDev.id,aemSrDev.id],"medium","Which are headless delivery options for AEM Content Fragments?",["AEM GraphQL API","Content Fragment Delivery OpenAPI","Server-side JSP only","Experience Fragment HTML export"],[0,1],"GraphQL and the Content Fragment Delivery OpenAPI are the primary headless delivery paths.","multi");
  // Content Author
  await q(topicAEMAuth.id,skillAEM.id,[aemAuthor.id,aemDev.id],"easy","What are Variations in a Content Fragment?",["Different versions stored in version history","Copies of the main fragment content tailored for specific channels or scenarios","Language translations","Workflow states"],1,"Variations allow authors to maintain channel-specific versions of the same fragment content (e.g. a shorter social media version).");
  await q(topicAEMAuth.id,skillAEM.id,aemAuthor.id,"easy","Where do authors create and edit Content Fragments in AEM?",["Adobe Dreamweaver","The Content Fragment Console and Content Fragment Editor","The Sites Page Editor","A desktop publishing tool"],1);
  await q(topicAEMAuth.id,skillAEM.id,aemAuthor.id,"easy","Can Content Fragments be used across multiple pages and channels?",["No, they are page-specific","Yes, they are page-independent and reusable across any channel or touchpoint","Only within one site","Only in email campaigns"],1,"Content Fragments are designed to be channel-neutral and reusable across web, mobile, kiosks, and other channels.");
  await q(topicAEMAuth.id,skillAEM.id,aemAuthor.id,"medium","What is 'Associated Content' in an AEM Content Fragment?",["Nested fragment references","Assets available in the side panel when placing a fragment on a page, providing contextual media","A field type","A versioning feature"],1);
  await q(topicAEMAuth.id,skillAEM.id,aemAuthor.id,"medium","What is the purpose of the Content Fragment Console in AEM?",["Managing OSGi bundles","Browsing, creating, filtering, and managing all Content Fragments across the repository","Editing page templates","Configuring Dispatcher rules"],1);

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — Contentful (based on contentful.com/developers/docs, 2025)
  // ══════════════════════════════════════════════════════════════════════════
  // Developer
  await q(topicCFDev.id,skillCF.id,[cfDev.id,cfAuthor.id],"easy","In Contentful, what is a Space?",["A physical data centre","A container grouping all content types, entries, assets, and settings for a project","A reusable content block","A CDN zone"],1,"A Space is the top-level container in Contentful. Each space has its own content model, entries, and API keys.");
  await q(topicCFDev.id,skillCF.id,[cfDev.id,cfAuthor.id],"easy","What are Entries in Contentful?",["API keys","Actual pieces of content created using a defined content type","Draft pages","API endpoints"],1);
  await q(topicCFDev.id,skillCF.id,cfDev.id,"easy","What is the Content Delivery API (CDA) used for?",["Creating content","Reading published content at scale; it should be used instead of the CMA for high-volume reads","Managing workflows","Setting permissions"],1,"The CDA is read-only and optimised for delivery. The CMA (Content Management API) is for managing content.");
  await q(topicCFDev.id,skillCF.id,cfDev.id,"medium","What is the Contentful GraphQL endpoint format?",["https://api.contentful.com/spaces/{id}/entries","https://graphql.contentful.com/content/v1/spaces/{space_id}","https://cdn.contentful.com/graphql","https://preview.contentful.com/graphql"],1);
  await q(topicCFDev.id,skillCF.id,cfDev.id,"medium","What is an Environment in Contentful used for?",["A deployment server","Branching content models and content (e.g. master, staging, development) to test changes before publishing","A locale setting","A team role"],1);
  await q(topicCFDev.id,skillCF.id,cfDev.id,"medium","What HTTP header must be set when creating a new entry via the CMA?",["X-Contentful-Space","X-Contentful-Content-Type with the content type ID","Authorization only","Content-Encoding"],1,"The X-Contentful-Content-Type header is required to tell the API which content type schema the new entry should follow.");
  await q(topicCFDev.id,skillCF.id,cfDev.id,"hard","What does the 'linkedFrom' field provide in Contentful GraphQL queries?",["A list of external links","Reverse reference lookup: finding all entries that reference a given entry","Asset metadata","A paginated collection"],1);
  await q(topicCFDev.id,skillCF.id,cfDev.id,"hard","What constraint must be set on a reference field to use relational filtering in Contentful GraphQL?",["Mark as required","A validation rule that restricts the field to accept only a single content type","Set maximum entries","Use rich text instead"],1,"Without a single-content-type validation on the reference field, relational (nested where) filtering is not supported in GraphQL.");
  await q(topicCFDev.id,skillCF.id,[cfDev.id,cfAuthor.id],"medium","Which Contentful APIs are read-only for published content delivery?",["Content Delivery API (CDA)","Content Preview API","Content Management API (CMA)","GraphQL Content API"],[0,3],"CDA and GraphQL Content API are read-only delivery APIs; CMA is for content management.","multi");
  // Content Author
  await q(topicCFAuth.id,skillCF.id,[cfAuthor.id,cfDev.id],"easy","What is a Content Type in Contentful?",["A published entry","A schema defining the fields and structure for a category of content","An API key","A CDN rule"],1);
  await q(topicCFAuth.id,skillCF.id,cfAuthor.id,"easy","How many fields can a single Content Type have in Contentful?",["10","25","Up to 50","Unlimited"],2);
  await q(topicCFAuth.id,skillCF.id,cfAuthor.id,"medium","What is the maximum character length of a Rich Text field in Contentful?",["50,000","100,000","200,000","Unlimited"],2,"The Rich Text field supports up to 200,000 characters and must not exceed 1MB total.");
  await q(topicCFAuth.id,skillCF.id,cfAuthor.id,"medium","What tool does Contentful recommend for merging content model changes between environments?",["Direct SQL migration","The Merge app in the Contentful web app, or the Contentful CLI","Manual copy-paste via CMA","GitHub Actions only"],1);

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — Contentstack (based on contentstack.com/docs and developers.contentstack.com, 2025)
  // ══════════════════════════════════════════════════════════════════════════
  // Developer
  await q(topicCSDev.id,skillCS.id,[csDev.id,csAuthor.id],"easy","What is a Stack in Contentstack?",["A Git branch","A top-level container holding content types, entries, assets, environments, and tokens for a project","A deployment server","A team folder"],1);
  await q(topicCSDev.id,skillCS.id,[csDev.id,csAuthor.id],"easy","What is the difference between the Delivery API and the Management API in Contentstack?",["Both do the same","Delivery API reads published content; Management API creates, updates, deletes, and publishes content","Delivery API is GraphQL only","Management API is read-only"],1);
  await q(topicCSDev.id,skillCS.id,csDev.id,"easy","What is the Preview API in Contentstack for?",["Analytics tracking","Reading draft or unpublished content during preview workflows","Bulk publishing","CDN cache purging"],1);
  await q(topicCSDev.id,skillCS.id,csDev.id,"medium","What is the scope of a content type in Contentstack with respect to branches?",["Global across all branches","Branch-specific: a content type created in one branch is not automatically available in other branches","Environment-specific","Organisation-wide"],1,"Content types are branch-specific in Contentstack; changes must be explicitly migrated or merged between branches.");
  await q(topicCSDev.id,skillCS.id,csDev.id,"medium","What is a Global Field in Contentstack?",["A required field on every content type","A reusable field group that can be inserted into multiple content types to avoid duplication","A field that appears on all entries","A system metadata field"],1);
  await q(topicCSDev.id,skillCS.id,csDev.id,"hard","What authentication tokens does Contentstack use for the Management API?",["Username/password only","Management Token or OAuth Token, combined with the Stack API key","Delivery Token","Basic Auth"],1);
  await q(topicCSDev.id,skillCS.id,csDev.id,"hard","What CLI tool does Contentstack provide for migrations and branch management?",["npx contentstack","csdx (Contentstack CLI)","cs-migrate","contentstack-cli"],1,"The csdx CLI supports content type migrations, branch operations, import/export, and automation of repetitive tasks.");
  await q(topicCSDev.id,skillCS.id,[csDev.id,csAuthor.id],"medium","Which Contentstack APIs are read-only and do not modify content?",["Delivery API","Management API","Preview API","Automation API"],[0,2],"Delivery API reads published content; Preview API reads draft content; Management API writes.","multi");
  // Content Author
  await q(topicCSAuth.id,skillCS.id,[csAuthor.id,csDev.id],"easy","What is a Modular Block in Contentstack?",["A code module","A composable page section type allowing editors to build pages from predefined blocks without developer involvement","A media file type","A metadata field"],1,"Modular Blocks are Contentstack's tool for page-building: developers define block types, editors choose and order them.");
  await q(topicCSAuth.id,skillCS.id,csAuthor.id,"easy","What are Entries in Contentstack?",["API keys","Actual content pieces created using a content type's schema","Draft templates","Webhook payloads"],1);
  await q(topicCSAuth.id,skillCS.id,csAuthor.id,"medium","What is the Live Preview feature in Contentstack?",["A production-readiness check","Real-time preview of content changes in the editor before saving or publishing","A staging environment","An analytics dashboard"],1);
  await q(topicCSAuth.id,skillCS.id,csAuthor.id,"medium","How many Modular Blocks fields can a single content type contain in Contentstack?",["1","Up to 5","Up to 10","Unlimited"],1,"Contentstack allows up to 5 Modular Blocks fields per content type, with up to 100 block definitions each.");

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — Adobe Analytics (based on experienceleague.adobe.com, 2025)
  // ══════════════════════════════════════════════════════════════════════════
  await q(topicAAImpl.id,skillAA.id,[aaAnalyst.id,aaSrAnalyst.id],"easy","What is a Report Suite in Adobe Analytics?",["A dashboard template","The data container that stores all collected analytics data for a property","A segment filter","An eVar group"],1,"Every Adobe Analytics implementation requires a Report Suite; it is the foundation that holds all collected data.");
  await q(topicAAImpl.id,skillAA.id,[aaAnalyst.id,aaSrAnalyst.id],"easy","What is Adobe's current recommended method for implementing Adobe Analytics?",["Hardcoded AppMeasurement library","Tags in Adobe Experience Platform (formerly Adobe Launch)","Direct server-side calls only","Google Tag Manager"],1,"Tags in Adobe Experience Platform is Adobe's current recommended tag management and implementation approach.");
  await q(topicAAImpl.id,skillAA.id,[aaAnalyst.id,aaSrAnalyst.id],"easy","What is the difference between an eVar and a prop in Adobe Analytics?",["They are identical","eVars persist and can be attributed to conversion events; props are traffic variables for pathing and do not persist","Props persist longer","eVars are only for page views"],1,"Adobe now recommends eVars for most use cases, as they support attribution and conversion; props are primarily for traffic analysis and pathing.");
  await q(topicAAImpl.id,skillAA.id,aaAnalyst.id,"medium","What does the Analytics extension in Adobe Experience Platform Tags do?",["Renders the UI","Provides a configuration interface to map data layer values to Analytics variables and send data to a report suite","Manages server-side containers","Handles A/B testing"],1);
  await q(topicAAImpl.id,skillAA.id,aaAnalyst.id,"medium","When using the Web SDK for Adobe Analytics, how is data mapped to props and eVars?",["Directly via s.eVar1","Via an XDM schema or data object; the concept of props/eVars is abstracted — they are mapped using datastream field mappings","Using AppMeasurement variables","They cannot be used with Web SDK"],1,"With the Web SDK, Analytics-specific fields (eVars, props) are mapped through datastream configuration or XDM field mappings, not set directly.");
  await q(topicAAImpl.id,skillAA.id,aaSrAnalyst.id,"hard","What is Customer Journey Analytics (CJA), and how does it differ from Adobe Analytics with respect to eVars?",["CJA is a reporting UI for Adobe Analytics","CJA is a separate analysis service built on AEP datasets; it does not use props or eVars — all fields are treated as standard schema fields","CJA replaces eVars with segments","CJA uses the same variable structure"],1,"CJA is built on Adobe Experience Platform datasets (not report suites) and treats all data as schema fields, removing the props/eVars paradigm.");
  await q(topicAAImpl.id,skillAA.id,aaSrAnalyst.id,"hard","What is the purpose of a Global Report Suite approach in Adobe Analytics?",["Lower data quality","Sending data from all properties into a single report suite to simplify governance, reduce server call consumption, and align variable usage","Each page gets its own report suite","Mandatory for mobile"],1);
  await q(topicAAImpl.id,skillAA.id,aaSrAnalyst.id,"medium","Up to how many eVars and props are available in a single Adobe Analytics report suite?",["10 each","75 props, 250 eVars (depending on contract)","50 each","Unlimited"],1);
  await q(topicAAImpl.id,skillAA.id,[aaAnalyst.id,aaSrAnalyst.id],"medium","Which Adobe Analytics variables support attribution to conversion events?",["eVars","Props","Events","List props"],[0,2],"eVars and Events support conversion attribution; standard props are primarily for traffic analysis.","multi");

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — Sitecore XM Cloud (based on 2025 migration guides and Sitecore docs)
  // ══════════════════════════════════════════════════════════════════════════
  await q(topicSCDev.id,skillSC.id,[scDev.id,scSrDev.id],"easy","What is the Sitecore Content SDK and how does it relate to JSS?",["A replacement name for JSS with no changes","A purpose-built SDK for XM Cloud that replaced JSS for XM Cloud implementations; JSS remains for XM/XP only","A CSS framework","A headless CMS"],1,"The Content SDK was extracted from JSS specifically for XM Cloud, removing XM/XP-specific code for a leaner, cloud-native developer experience.");
  await q(topicSCDev.id,skillSC.id,[scDev.id,scSrDev.id],"easy","What is the primary frontend framework used with Sitecore XM Cloud Content SDK?",["Angular","Next.js","Vue.js","Gatsby"],1,"XM Cloud's Content SDK is built around Next.js with both Pages Router and App Router support.");
  await q(topicSCDev.id,skillSC.id,[scDev.id,scSrDev.id],"easy","What is the status of Sitecore JSS 22.x as of 2026?",["Actively developed","In maintenance mode and officially deprecated in June 2026","Replaced by Sitecore JSS 23","Still the recommended approach"],1,"JSS 22.x is in maintenance mode with no new features; only critical bug fixes and security patches until deprecation in June 2026.");
  await q(topicSCDev.id,skillSC.id,scDev.id,"medium","What is SitecoreClient in the Content SDK?",["A CLI tool","A centralised API client that handles all Sitecore data operations (layout, dictionary, component props, editing) replacing the plugin-based JSS approach","A Next.js plugin","A CMS backend"],1,"The SitecoreClient is the single source of truth for all Content SDK communication, replacing the scattered service classes in JSS.");
  await q(topicSCDev.id,skillSC.id,scDev.id,"medium","How do authors edit content in Sitecore XM Cloud?",["Experience Editor","XM Cloud Pages (Page Builder) — the Experience Editor is not available in XM Cloud","Sitecore SXA drag-and-drop","A desktop client"],1,"XM Cloud does not include the legacy Experience Editor; all WYSIWYG authoring uses XM Cloud Pages.");
  await q(topicSCDev.id,skillSC.id,scDev.id,"medium","What package prefix identifies Sitecore Content SDK packages?",["@sitecore-jss/","@sitecore-content-sdk/","@sitecore/","@sc-cloud/"],1,"Content SDK packages use the @sitecore-content-sdk scope (e.g. @sitecore-content-sdk/nextjs), replacing the legacy @sitecore-jss prefix.");
  await q(topicSCDev.id,skillSC.id,scSrDev.id,"hard","What are the minimum runtime requirements for Sitecore Content SDK 2.0?",["Node.js 18 + Next.js 13","Node.js 24 + Next.js 16","Node.js 22 + Next.js 15","Node.js 20 + Next.js 14"],1,"Content SDK 2.0 requires Node.js 24 and Next.js 16 as minimum baseline.");
  await q(topicSCDev.id,skillSC.id,scSrDev.id,"hard","What is @sitecore-cloudsdk/events used for in XM Cloud implementations?",["Form submissions","Sending analytics and personalisation events directly to SitecoreAI / CDP","Error logging","Content preview"],1,"The @sitecore-cloudsdk/events package sends events (page view, click, etc.) into the SitecoreAI platform for personalisation and analytics.");
  await q(topicSCDev.id,skillSC.id,scSrDev.id,"hard","What quantitative improvements did teams see when migrating from JSS to Content SDK on the PLAY! Summit demo?",["10% bundle reduction","~49% smaller bundle, 81% fewer files, and 39% less code","200% performance boost","No measurable difference"],1,"Real-world migration data showed ~49% bundle size reduction, 81% fewer files, and 39% less code vs the JSS version.");
  await q(topicSCDev.id,skillSC.id,[scDev.id,scSrDev.id],"medium","Which packages belong to the Sitecore Content SDK (not legacy JSS)?",["@sitecore-content-sdk/nextjs","@sitecore-jss/sitecore-jss-nextjs","@sitecore-content-sdk/core","@sitecore-jss/react"],[0,2],"Content SDK uses @sitecore-content-sdk/*; @sitecore-jss/* is the legacy JSS scope.","multi");

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — Android with Jetpack Compose (based on developer.android.com, 2025)
  // ══════════════════════════════════════════════════════════════════════════
  await q(topicAND.id,skillAND.id,[andDev.id,andSrDev.id],"easy","What is Jetpack Compose?",["An XML layout tool","Android's recommended modern declarative UI toolkit for building native UIs with Kotlin","A Java UI framework","An Android emulator"],1,"Jetpack Compose is officially Google's recommended way to build new Android UIs as of 2025.");
  await q(topicAND.id,skillAND.id,[andDev.id,andSrDev.id],"easy","What architectural pattern does Google recommend for Jetpack Compose apps?",["MVC","MVP","MVVM with Unidirectional Data Flow (UDF)","VIPER"],2,"Google's official guidelines recommend MVVM + UDF: state flows down from ViewModel to Composables, events flow up.");
  await q(topicAND.id,skillAND.id,[andDev.id,andSrDev.id],"easy","What should a ViewModel expose to a Composable for UI state?",["Mutable lists","An immutable StateFlow<UiState>","LiveData only","MutableState directly"],1,"ViewModels should expose UI state as immutable StateFlow; the Composable observes it via collectAsStateWithLifecycle.");
  await q(topicAND.id,skillAND.id,andDev.id,"medium","Why are Kotlin Flows preferred over LiveData in modern Android development?",["Flows are easier to understand","Flows support structured concurrency, backpressure, and are coroutine-native; LiveData is lifecycle-aware but limited outside Android","LiveData was deprecated","Flows use less memory"],1);
  await q(topicAND.id,skillAND.id,andDev.id,"medium","Which design systems does Jetpack Compose support for theming?",["Bootstrap only","Material 3 (Material You) with full theming and component support","Material 2 only","Custom CSS"],1,"Compose supports Material 3, enabling Material You dynamic colour theming.");
  await q(topicAND.id,skillAND.id,andDev.id,"hard","According to Google's architecture recommendations, what should you NOT do with ViewModels and Composables?",["Use StateFlow","Pass ViewModel to deeply nested composables — pass state and lambdas instead","Use viewModelScope","Expose immutable UI state"],1,"Google recommends not passing ViewModels down the composable tree; instead pass only the state and event callbacks needed.");
  await q(topicAND.id,skillAND.id,[andDev.id,andSrDev.id],"medium","Which are recommended state holders in Jetpack Compose architecture?",["ViewModel exposing StateFlow","MutableState in Composables for all app state","UiState data class","Passing ViewModel to every child Composable"],[0,2],"ViewModel + StateFlow and a UiState model are recommended; avoid passing ViewModels down the tree.","multi");
  await q(topicAND.id,skillAND.id,andSrDev.id,"medium","What should you use instead of overriding Activity lifecycle callbacks for lifecycle-aware work in Compose?",["LifecycleObserver in ViewModel","Compose LifecycleEffects (LifecycleStartEffect, LifecycleResumeEffect) or lifecycle-aware coroutine scopes","onStop() override","BroadcastReceiver"],1);
  await q(topicAND.id,skillAND.id,andSrDev.id,"hard","What is the purpose of viewModelScope in Android architecture?",["A Hilt annotation","A coroutine scope tied to the ViewModel's lifecycle; coroutines launched here are cancelled when the ViewModel is cleared","A DI container","A composable scope"],1);
  await q(topicAND.id,skillAND.id,andSrDev.id,"hard","What form factors does Jetpack Compose support for adaptive layout?",["Phones only","Phones, tablets, foldables, ChromeOS, CarPlay displays, XR 2D, and Wear OS","Phones and tablets only","Android TV only"],1,"Compose supports adaptive UI across all Android form factors via Material 3 Adaptive layouts.");

  // ══════════════════════════════════════════════════════════════════════════
  // QUESTIONS — iOS / SwiftUI (based on WWDC 2025, developer.apple.com)
  // ══════════════════════════════════════════════════════════════════════════
  await q(topicIOS.id,skillIOS.id,[iosDev.id,iosSrDev.id],"easy","What major design language did Apple introduce at WWDC 2025 (iOS 26)?",["Flat Glass","Liquid Glass — a translucent, fluid adaptive material for controls and navigation","Material You","Fluent Design"],1,"Apple introduced Liquid Glass at WWDC 2025 as the most significant visual overhaul since iOS 7's flat design in 2013.");
  await q(topicIOS.id,skillIOS.id,[iosDev.id,iosSrDev.id],"easy","Do standard SwiftUI components automatically adopt Liquid Glass?",["No, you must opt in explicitly","Yes — standard components (bars, sheets, popovers, controls) pick up Liquid Glass automatically when built with the Xcode 26 SDK","Only on iPad","Only with UIKit"],1,"Standard framework components adopt Liquid Glass automatically; custom elements require the .glassEffect modifier.");
  await q(topicIOS.id,skillIOS.id,[iosDev.id,iosSrDev.id],"easy","What new SwiftUI view was introduced in WWDC 2025 for displaying web content?",["HTMLView","WebView — a native SwiftUI view powered by WebKit","WKWebView wrapper","BrowserView"],1,"WebView is a new, fully native SwiftUI API for embedding web content, introduced in 2025 alongside a complete set of WebKit SwiftUI APIs.");
  await q(topicIOS.id,skillIOS.id,iosDev.id,"medium","How do you apply Liquid Glass to a custom view in SwiftUI?",["Use .opacity(0.5)","Apply the .glassEffect() modifier","Use UIVisualEffectView","Add a blur overlay"],1,"Custom elements use .glassEffect() with optional configuration; multiple glass elements in the same container should use GlassEffectContainer.");
  await q(topicIOS.id,skillIOS.id,iosDev.id,"medium","What is GlassEffectContainer in SwiftUI and why is it used?",["A navigation container","A container that composites multiple glass effects into a single render pass, optimising performance and enabling morphing between shapes","A sheet presentation modifier","A layout container for blurred views"],1);
  await q(topicIOS.id,skillIOS.id,iosDev.id,"medium","What does TextEditor now support in SwiftUI after WWDC 2025?",["Markdown rendering","AttributedString for rich text formatting with built-in text formatting controls","Custom fonts only","HTML input"],1,"WWDC 2025 added AttributedString support to TextEditor, enabling rich text editing (bold, italic, lists, etc.) natively in SwiftUI.");
  await q(topicIOS.id,skillIOS.id,iosDev.id,"hard","What navigation transition does Apple recommend for Liquid Glass interfaces?",["Default push transition","Zoom transition (.navigationTransition(.zoom(sourceID:in:))) — it expands from the tapped element into the destination","Slide transition","None; transitions are automatic"],1,"The zoom transition is Apple's recommended standard for Liquid Glass navigation, sourcing the transition from the tapped element.");
  await q(topicIOS.id,skillIOS.id,iosSrDev.id,"hard","What is Scene Bridging in SwiftUI introduced at WWDC 2025?",["A way to share data between apps","Allows UIKit and AppKit apps to host native SwiftUI scenes (WindowGroup, MenuBarExtra, ImmersiveSpace), enabling modular migration","A CoreData feature","A CloudKit sync mechanism"],1);
  await q(topicIOS.id,skillIOS.id,iosSrDev.id,"hard","What glassEffectID and @Namespace pattern enables in SwiftUI Liquid Glass?",["Shared state between views","Smooth shape morphing between glass elements when they are added/removed or change position using withAnimation","Type-safe navigation","Lazy loading"],1);
  await q(topicIOS.id,skillIOS.id,iosSrDev.id,"medium","How does Tab(role: .search) + .searchable() work in iOS 26 SwiftUI?",["Opens Safari","Creates a dedicated search tab that transforms the tab bar into a live search field matching Apple's new design pattern","Adds a search bar to the navigation bar only","Triggers Spotlight search"],1);
  await q(topicIOS.id,skillIOS.id,[iosDev.id,iosSrDev.id],"medium","Which SwiftUI modifiers are related to Liquid Glass in iOS 26?",[".glassEffect()",".glassEffectID(_:in:)",".materialBackground()","GlassEffectContainer"],[0,1,3],"glassEffect, glassEffectID, and GlassEffectContainer are Liquid Glass APIs; materialBackground is not.","multi");

  // ══════════════════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════════════════
  const admin = await prisma.user.upsert({ where: { email: "admin@example.com" }, update: { role: "admin" }, create: { email: "admin@example.com", name: "Admin User", role: "admin" } });
  const manager = await prisma.user.upsert({ where: { email: "manager@example.com" }, update: { role: "capability_manager" }, create: { email: "manager@example.com", name: "Priya Sharma", role: "capability_manager" } });
  const manager2 = await prisma.user.upsert({ where: { email: "manager2@example.com" }, update: { role: "capability_manager" }, create: { email: "manager2@example.com", name: "Raj Kumar", role: "capability_manager" } });
  for (const u of [admin, manager, manager2]) {
    await prisma.candidateProfile.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id, employeeName: u.name, country: "IN" } });
  }
  const candidateDefs = [
    { email: "candidate@example.com", name: "Test Candidate", emp: "EMP001", band: "B3", proj: "PROJ-ALPHA", customer: "Acme Corp" },
    { email: "alice@example.com",     name: "Alice Johnson",  emp: "EMP002", band: "B4", proj: "PROJ-BETA",  customer: "TechCo" },
    { email: "bob@example.com",       name: "Bob Williams",   emp: "EMP003", band: "B2", proj: "PROJ-ALPHA", customer: "Acme Corp" },
    { email: "carol@example.com",     name: "Carol Davis",    emp: "EMP004", band: "B4", proj: "PROJ-GAMMA", customer: "DataInc" },
    { email: "david@example.com",     name: "David Lee",      emp: "EMP005", band: "B3", proj: "PROJ-DELTA", customer: "CloudCo" },
  ];
  const candidates = [];
  for (const c of candidateDefs) {
    const user = await prisma.user.upsert({ where: { email: c.email }, update: {}, create: { email: c.email, name: c.name, role: "candidate" } });
    await prisma.candidateProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id, employeeName: c.name, employeeId: c.emp, band: c.band, country: "IN", reportingManagerCode: "MGR001", reportingManagerName: "Priya Sharma", projectCode: c.proj, projectName: `Project ${c.proj.split("-")[1]}`, customerCode: c.customer.replace(/\s/g,"").toUpperCase(), customerName: c.customer, assignFromDate: new Date("2025-01-01"), assignToDate: new Date("2025-12-31"), allocationPercentage: 100, fte: 1.0, status: "Active" } });
    candidates.push(user);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BLUEPRINTS
  // ══════════════════════════════════════════════════════════════════════════
  // Single-topic blueprints (most common)
  await mkBlueprint(admin, "JavaScript — Associate Developer",          skillJS.id,   [topicJSBasics.id], jsAssoc.id,  3,2,0,20);
  await mkBlueprint(admin, "JavaScript — Senior Developer",             skillJS.id,   [topicJSBasics.id], jsSr.id,     1,3,2,30);
  await mkBlueprint(admin, "JavaScript Async — Senior Developer",       skillJS.id,   [topicJSAsync.id],  jsSr.id,     1,2,2,25);
  await mkBlueprint(admin, "TypeScript — Senior Developer",             skillTS.id,   [topicTS.id],       tsSr.id,     1,2,3,30);
  await mkBlueprint(admin, "React — Senior Developer",                  skillReact.id,[topicReact.id],    reactSr.id,  1,2,2,25);
  await mkBlueprint(admin, "Adobe Commerce — Developer",                skillAC.id,   [topicACDev.id],    acDev.id,    2,2,1,30,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Adobe Commerce — Senior Developer",         skillAC.id,   [topicACDev.id],    acSrDev.id,  1,2,2,35,  { passMark:70, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "commercetools — Developer",                 skillCT.id,   [topicCTFund.id],   ctDev.id,    2,2,1,25,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "commercetools — Senior Developer",          skillCT.id,   [topicCTFund.id],   ctSrDev.id,  1,2,2,30,  { passMark:70, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "AEM Cloud Service — Developer",             skillAEM.id,  [topicAEMDev.id],   aemDev.id,   2,2,1,30,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "AEM — Content Author",                      skillAEM.id,  [topicAEMAuth.id],  aemAuthor.id,3,2,0,20,  { passMark:60, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Contentful — Developer",                    skillCF.id,   [topicCFDev.id],    cfDev.id,    2,2,1,25,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Contentful — Content Author",               skillCF.id,   [topicCFAuth.id],   cfAuthor.id, 3,2,0,20,  { passMark:60, issueCertificate:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Contentstack — Developer",                  skillCS.id,   [topicCSDev.id],    csDev.id,    2,2,1,25,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Contentstack — Content Author",             skillCS.id,   [topicCSAuth.id],   csAuthor.id, 3,2,0,20,  { passMark:60, issueCertificate:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Adobe Analytics — Implementation Analyst",  skillAA.id,   [topicAAImpl.id],   aaAnalyst.id,2,2,1,25,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Sitecore XM Cloud — Developer",             skillSC.id,   [topicSCDev.id],    scDev.id,    2,2,1,30,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Android — Developer",                       skillAND.id,  [topicAND.id],      andDev.id,   2,2,1,25,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "Android — Senior Developer",                skillAND.id,  [topicAND.id],      andSrDev.id, 1,2,2,30,  { passMark:70, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "iOS — Developer",                           skillIOS.id,  [topicIOS.id],      iosDev.id,   2,2,1,25,  { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  await mkBlueprint(admin, "iOS — Senior Developer",                    skillIOS.id,  [topicIOS.id],      iosSrDev.id, 1,2,2,30,  { passMark:70, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });
  // Multi-topic blueprint (demonstrates cross-topic question pooling)
  await mkBlueprint(admin, "JavaScript Full Stack — Senior Developer",  skillJS.id,   [topicJSBasics.id, topicJSAsync.id], jsSr.id, 1,3,3,45, { passMark:70, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true, multiSelectScoringMode: "partial_credit" });
  await mkBlueprint(admin, "AEM Full Practitioner",                     skillAEM.id,  [topicAEMDev.id, topicAEMAuth.id],  aemDev.id,2,3,2,45, { passMark:65, issueCertificate:true, showProficiencyOnCert:true, certValidityDays:365, revealAnswersAfterTest:true });

  // ══════════════════════════════════════════════════════════════════════════
  // SAMPLE ASSIGNMENTS
  // ══════════════════════════════════════════════════════════════════════════
  const allBPs = await prisma.assessmentBlueprint.findMany({
    where: { name: { in: ["JavaScript — Associate Developer","Adobe Commerce — Developer","Contentful — Content Author","Sitecore XM Cloud — Developer","Android — Developer"] } },
    include: { topics: true },
  });
  const bpByName = new Map(allBPs.map(b => [b.name, b]));
  async function assign(userId: string, bpName: string, assignedById: string, days: number) {
    const bp = bpByName.get(bpName);
    if (!bp) return;
    const ex = await prisma.assessment.findFirst({ where: { userId, blueprintId: bp.id } });
    if (ex) return;
    await prisma.assessment.create({
      data: {
        userId, skillId: bp.skillId, skillRoleId: bp.skillRoleId, assignedById,
        blueprintId: bp.id, displayName: bp.name,
        questionCount: bp.questionCount, easyCount: bp.easyCount, mediumCount: bp.mediumCount, hardCount: bp.hardCount,
        timeLimitMinutes: bp.timeLimitMinutes, deadline: new Date(Date.now() + days * 86400_000),
        // Snapshot cert/pass settings from blueprint
        passMark: bp.passMark, issueCertificate: bp.issueCertificate,
        showProficiencyOnCert: bp.showProficiencyOnCert, certValidityDays: bp.certValidityDays,
        revealAnswersAfterTest: bp.revealAnswersAfterTest,
        proficiencyThresholds: bp.proficiencyThresholds,
        multiSelectScoringMode: bp.multiSelectScoringMode,
        topics: { create: bp.topics.map(t => ({ topicId: t.topicId })) },
      },
    });
  }
  await assign(candidates[0].id, "JavaScript — Associate Developer",  manager.id,  7);
  await assign(candidates[1].id, "Adobe Commerce — Developer",        manager.id,  10);
  await assign(candidates[2].id, "Sitecore XM Cloud — Developer",     manager2.id, 7);
  await assign(candidates[3].id, "Contentful — Content Author",       manager2.id, 14);
  await assign(candidates[4].id, "Android — Developer",               manager.id,  14);

  console.log("✅ Seed complete!");
  console.log("   Categories: 8");
  console.log("   Skills: JS001 TS001 FE001 BE001 DB001 DO001 CL001 | AC001 CT001 AEM001 CF001 CS001 AA001 SC001 AND001 IOS001");
  console.log("   Questions: ~170+ published (includes 16 multi-select across JS, React, TS, Node, SQL, AC, CT, AEM, CF, CS, AA, SC, Android, iOS)");
  console.log("   Blueprints: 23 named blueprints (21 single-topic + 2 multi-topic examples)");
  console.log("   Users: admin, 2 managers, 5 candidates + profiles + assignments");
}

let seedFailed = false;
main()
  .catch((e) => {
    console.error(e);
    seedFailed = true;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (seedFailed) process.exit(1);
  });
