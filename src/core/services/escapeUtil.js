/** Helper to escape characters for MarkdownV2 */
const escapeMarkdownV2 = (str) => {
    if (!str) return '';
    // Order matters for escaping the escape character itself
    // Escapes: \ _ * [ ] ( ) ~ ` > # + - = | { } . !
    return str.replace(/[\\_*[\]()~`>#+-=|{}.!]/g, '\\$&');
};

module.exports = {
    escapeMarkdownV2,
}; 