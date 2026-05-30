const tabWidth = 4;

export default function recurse(obj, level = 0, root = true, arrIsLastChild = []) {
    let prefix = "";

    for (let i = 0; i < level - 1; i++) {
        prefix += (arrIsLastChild[i] ? " " : "│") + " ".repeat(tabWidth);
    }

    if (level != 0) {
        prefix += (arrIsLastChild[arrIsLastChild.length - 1] ? "└" : "├") + "─".repeat(tabWidth);
    }

    if (root) {
        if (obj.cards) {
            prefix += "┌";
        } else {
            prefix += "─";
        }
    } else if (obj.cards) {
        prefix += "┬";
    } else {
        prefix += "─";
    }

    // process.stdout.write(`${prefix}➤ ${obj.title}\n`);
    prefix += `➤ ${obj.title}\n`;

    if (obj.cards) {
        obj.cards.forEach(
            (card, index) =>
                (prefix += recurse(card, level + 1, false, [...arrIsLastChild, index == obj.cards.length - 1])),
        );
    }

    return prefix;
}

// Test Case 1: Simple linear tree (chain)
const linearTree = {
    title: "Root",
    cards: [
        {
            title: "Level 1",
            cards: [
                {
                    title: "Level 2",
                    cards: [
                        {
                            title: "Level 3 Leaf",
                        },
                    ],
                },
            ],
        },
    ],
};

// Test Case 2: Binary tree structure
const binaryTree = {
    title: "Root",
    cards: [
        {
            title: "Left Branch",
            cards: [{ title: "Left-Left Leaf" }, { title: "Left-Right Leaf" }],
        },
        {
            title: "Right Branch",
            cards: [{ title: "Right-Left Leaf" }, { title: "Right-Right Leaf" }],
        },
    ],
};

// Test Case 3: Large asymmetric tree
const largeTree = {
    title: "Company",
    cards: [
        {
            title: "Engineering",
            cards: [
                {
                    title: "Frontend",
                    cards: [{ title: "React Team" }, { title: "Vue Team" }, { title: "Angular Team" }],
                },
                {
                    title: "Backend",
                    cards: [
                        {
                            title: "API Development",
                            cards: [{ title: "REST APIs" }, { title: "GraphQL APIs" }, { title: "gRPC Services" }],
                        },
                        {
                            title: "Database",
                            cards: [{ title: "PostgreSQL Team" }, { title: "MongoDB Team" }],
                        },
                    ],
                },
                {
                    title: "DevOps",
                    cards: [
                        { title: "CI/CD Pipeline" },
                        { title: "Container Orchestration" },
                        { title: "Monitoring & Logging" },
                    ],
                },
            ],
        },
        {
            title: "Product",
            cards: [{ title: "Product Managers" }, { title: "UX Designers" }, { title: "UI Designers" }],
        },
        {
            title: "Marketing",
            cards: [
                {
                    title: "Digital Marketing",
                    cards: [{ title: "SEO Specialists" }, { title: "Social Media" }, { title: "Content Marketing" }],
                },
                { title: "Brand Marketing" },
                { title: "Growth Marketing" },
            ],
        },
    ],
};

// Test Case 4: Deep narrow tree (stress test for recursion depth)
const deepTree = {
    title: "Level 0",
    cards: [
        {
            title: "Level 1",
            cards: [
                {
                    title: "Level 2",
                    cards: [
                        {
                            title: "Level 3",
                            cards: [
                                {
                                    title: "Level 4",
                                    cards: [
                                        {
                                            title: "Level 5",
                                            cards: [
                                                {
                                                    title: "Level 6",
                                                    cards: [
                                                        {
                                                            title: "Level 7",
                                                            cards: [
                                                                {
                                                                    title: "Level 8",
                                                                    cards: [
                                                                        {
                                                                            title: "Level 9",
                                                                            cards: [
                                                                                {
                                                                                    title: "Level 10 Deep Leaf",
                                                                                },
                                                                            ],
                                                                        },
                                                                    ],
                                                                },
                                                            ],
                                                        },
                                                    ],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
};

// Test Case 5: Wide tree (many siblings)
const wideTree = {
    title: "Root",
    cards: [
        { title: "Child 1" },
        { title: "Child 2" },
        { title: "Child 3" },
        { title: "Child 4" },
        { title: "Child 5" },
        { title: "Child 6" },
        { title: "Child 7" },
        { title: "Child 8" },
        { title: "Child 9" },
        { title: "Child 10" },
        { title: "Child 11" },
        { title: "Child 12" },
        { title: "Child 13" },
        { title: "Child 14" },
        { title: "Child 15" },
    ],
};

// Test Case 6: Mixed depth tree
const mixedDepthTree = {
    title: "Project",
    cards: [
        { title: "Quick Task" },
        {
            title: "Medium Task",
            cards: [{ title: "Subtask A" }, { title: "Subtask B" }],
        },
        {
            title: "Complex Task",
            cards: [
                {
                    title: "Phase 1",
                    cards: [
                        { title: "Research" },
                        { title: "Planning" },
                        {
                            title: "Analysis",
                            cards: [
                                { title: "Data Collection" },
                                { title: "Data Processing" },
                                { title: "Report Generation" },
                            ],
                        },
                    ],
                },
                {
                    title: "Phase 2",
                    cards: [{ title: "Implementation" }, { title: "Testing" }],
                },
            ],
        },
    ],
};

// Test Case 7: Single leaf node
const singleLeaf = {
    title: "Just a Leaf",
};

// Test Case 8: Large realistic tree (file system simulation)
const fileSystemTree = {
    title: "src",
    cards: [
        {
            title: "components",
            cards: [
                {
                    title: "common",
                    cards: [{ title: "Button.js" }, { title: "Input.js" }, { title: "Modal.js" }],
                },
                {
                    title: "layout",
                    cards: [{ title: "Header.js" }, { title: "Footer.js" }, { title: "Sidebar.js" }],
                },
                {
                    title: "pages",
                    cards: [
                        { title: "Home.js" },
                        { title: "About.js" },
                        { title: "Contact.js" },
                        {
                            title: "user",
                            cards: [{ title: "Profile.js" }, { title: "Settings.js" }, { title: "Dashboard.js" }],
                        },
                    ],
                },
            ],
        },
        {
            title: "utils",
            cards: [{ title: "helpers.js" }, { title: "constants.js" }, { title: "api.js" }],
        },
        {
            title: "styles",
            cards: [{ title: "main.css" }, { title: "components.css" }, { title: "utilities.css" }],
        },
        { title: "index.js" },
        { title: "App.js" },
    ],
};

// Function to test all cases
function runTests() {
    const testCases = [
        { name: "Linear Tree", data: linearTree },
        { name: "Binary Tree", data: binaryTree },
        { name: "Large Asymmetric Tree", data: largeTree },
        { name: "Deep Tree (10 levels)", data: deepTree },
        { name: "Wide Tree (15 children)", data: wideTree },
        { name: "Mixed Depth Tree", data: mixedDepthTree },
        { name: "Single Leaf", data: singleLeaf },
        { name: "File System Tree", data: fileSystemTree },
    ];

    testCases.forEach((testCase, index) => {
        console.log(`\n${"=".repeat(50)}`);
        console.log(`TEST CASE ${index + 1}: ${testCase.name}`);
        console.log(`${"=".repeat(50)}`);
        recurse(testCase.data);
        console.log("\n");
    });
}

// Uncomment the line below to run all tests
// runTests();
