export default function filter(course) {
    let totalCount = 0,
        removedCount = 0;

    function filterRecursively(obj) {
        // console.log(obj);
        if (obj.cards) {
            for (let i = 0; i < obj.cards.length; ) {
                if (filterRecursively(obj.cards[i])) {
                    obj.cards.splice(i, 1);
                    removedCount++;
                    continue;
                }

                i++;
            }

            return;
        }

        totalCount++;

        // Filter out optional videos
        return /^\(?Optional\)/.test(obj.title);
    }

    filterRecursively(course);
    console.log(`Found ${totalCount} courses.`);
    console.log(`Removed ${removedCount} \`(Optional)\` courses.`);
}
