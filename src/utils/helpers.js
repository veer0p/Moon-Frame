// Generate a random 6-character room code
export const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
};

// Generate a random username if none provided
export const generateUsername = () => {
    const adjectives = ['Happy', 'Sleepy', 'Grumpy', 'Dopey', 'Bashful', 'Sneezy', 'Doc'];
    const nouns = ['Panda', 'Tiger', 'Lion', 'Bear', 'Wolf', 'Fox', 'Eagle'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
};
