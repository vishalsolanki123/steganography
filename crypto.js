const cv = require('opencv4nodejs');
const fs = require('fs');
const path = require('path');

const HEADER_FILENAME_LENGTH = 30;
const HEADER_FILESIZE_LENGTH = 20;
const HEADER_LENGTH = HEADER_FILENAME_LENGTH + HEADER_FILESIZE_LENGTH;

// n: 104 ---> [011, 010, 00]
const getBits = (n) => [n >> 5, (n & 0x1C) >> 2, n & 0x3];

// bits[011, 010, 00] ---> 104
const getByte = (bits) => (((bits[0] << 3) | bits[1]) << 2) | bits[2];

// Get file size
const getFileSize = (fileName) => {
    try {
        return fs.statSync(fileName).size;
    } catch (err) {
        return 0;
    }
};

// Generate header for embedding
const generateHeader = (fileName) => {
    let qty = getFileSize(fileName);
    if (qty === 0) {
        return null;
    }

    // Compose header for fileName
    const name = path.basename(fileName); // work.jpg
    const nameParts = name.split('.');
    const extLen = nameParts[1].length + 1;
    const nameLen = HEADER_FILENAME_LENGTH - extLen;
    const fileNamePadded = nameParts[0].substring(0, nameLen) + '.' + nameParts[1];

    const paddedName = fileNamePadded.padEnd(HEADER_FILENAME_LENGTH, '*');
    const paddedQty = qty.toString().padEnd(HEADER_FILESIZE_LENGTH, '*');

    return paddedName + paddedQty;
};

// Embed file into image
const embed = (resultantImg, sourceImg, fileToEmbed) => {
    // Load the image as cv.Mat
    const image = cv.imread(sourceImg, cv.IMREAD_COLOR);
    if (!image) {
        console.log(`${sourceImg} not found`);
        return;
    }

    // Check the file to embed
    const fs = getFileSize(fileToEmbed);
    if (fs === 0) {
        console.log(`${fileToEmbed} not found`);
        return;
    }

    // Capacity check
    const { rows: h, cols: w } = image;
    if (h * w < fs + HEADER_LENGTH) {
        console.log('Insufficient Embedding Capacity');
        return;
    }

    // Embed: order - header, file
    const header = generateHeader(fileToEmbed);
    const fileBuffer = fs.readFileSync(fileToEmbed);
    let cnt = 0;
    let data = 0;
    let keepEmbedding = true;

    for (let i = 0; i < h && keepEmbedding; i++) {
        for (let j = 0; j < w; j++) {
            // Get the data
            if (cnt < HEADER_LENGTH) {
                data = header.charCodeAt(cnt); // from header
            } else {
                if (cnt - HEADER_LENGTH < fileBuffer.length) {
                    data = fileBuffer[cnt - HEADER_LENGTH]; // from file
                } else {
                    keepEmbedding = false;
                    break; // EOF
                }
            }

            const bits = getBits(data);

            // Embed in image channels
            image.at(i, j).set([0], (image.at(i, j).get(0) & ~0x3) | bits[2]); // embed in blue band
            image.at(i, j).set([1], (image.at(i, j).get(1) & ~0x7) | bits[1]); // embed in green band
            image.at(i, j).set([2], (image.at(i, j).get(2) & ~0x7) | bits[0]); // embed in red band

            cnt++;
        }
    }

    // Save back the image
    cv.imwrite(resultantImg, image);
    console.log('Embedding Done');
};

// Extract file from image
const extract = (resultantImg, targetFolder) => {
    // Load the image as cv.Mat
    const image = cv.imread(resultantImg, cv.IMREAD_COLOR);
    if (!image) {
        console.log(`${resultantImg} not found`);
        return;
    }

    const { rows: h, cols: w } = image;
    let header = '';
    let fileSize = 0;
    let cnt = 0;
    let keepExtracting = true;
    let fileBuffer = Buffer.alloc(0);
    let filePath = '';

    for (let i = 0; i < h && keepExtracting; i++) {
        for (let j = 0; j < w; j++) {
            // Extract from image channels
            const bit1 = image.at(i, j).get(2) & 0x7; // extract from red band
            const bit2 = image.at(i, j).get(1) & 0x7; // extract from green band
            const bit3 = image.at(i, j).get(0) & 0x3; // extract from blue band

            const data = getByte([bit1, bit2, bit3]);

            // Put the data
            if (cnt < HEADER_LENGTH) {
                header += String.fromCharCode(data); // into header
            } else {
                if (cnt === HEADER_LENGTH) {
                    const fileName = header.slice(0, HEADER_FILENAME_LENGTH).replace(/\*/g, '');
                    fileSize = parseInt(header.slice(HEADER_FILENAME_LENGTH).replace(/\*/g, ''), 10);
                    filePath = path.join(targetFolder, fileName);
                    fileBuffer = Buffer.alloc(fileSize);
                }

                if (cnt - HEADER_LENGTH < fileSize) {
                    fileBuffer[cnt - HEADER_LENGTH] = data; // into file
                } else {
                    keepExtracting = false;
                    break; // Done
                }
            }

            cnt++;
        }
    }

    // Save the extracted file
    fs.writeFileSync(filePath, fileBuffer);
    console.log('Extracting Done');
};

// Start here
embed('d:/images/result.png', 'd:/images/work.jpg', 'd:/a.txt');
extract('d:/images/result.png', 'e:/');
