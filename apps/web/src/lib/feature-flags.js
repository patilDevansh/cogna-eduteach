"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.experimentsEnabled = experimentsEnabled;
exports.contentLlmDraftsEnabled = contentLlmDraftsEnabled;
function experimentsEnabled() {
    return process.env.EXPERIMENTS_ENABLED === "true";
}
function contentLlmDraftsEnabled() {
    return process.env.CONTENT_LLM_DRAFTS_ENABLED === "true";
}
//# sourceMappingURL=feature-flags.js.map