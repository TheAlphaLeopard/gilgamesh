/**
 * Squared (^2) Time Module
 * Provides time-related utilities.
 */

export const time = {
    /**
     * Pauses execution for the specified number of seconds.
     * Use: time.sleep(!2!)
     */
    sleep: async (seconds) => {
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    },
    
    /**
     * Returns the current Unix timestamp in seconds.
     */
    now: () => {
        return Math.floor(Date.now() / 1000);
    }
};

export default time;