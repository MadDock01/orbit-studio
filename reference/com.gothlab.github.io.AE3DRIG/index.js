const { jsPDF } = window.jspdf
const DOMPurify = window.DOMPurify

var TEST = 'hey';
var XXX;
var YYY;
var PDFCB;
var ZZZ;

//////////////////
var log = "";

function addToLog(text) {
  log += text + "\n";
}
/////////////////////


const defaultSample = ``

const editor = CodeMirror(document.getElementById('editor'), {
  lineNumbers: true,
  mode: 'xml'
})

const doc = editor.getDoc()

window.addEventListener('load', () => {
  const url = new URL(window.location)
  const editorText = url.searchParams.get('svg')
  if (editorText) {
    doc.setValue(decodeURIComponent(defaultSample))
  } else {
    doc.setValue(defaultSample)
  }
})

editor.on(
  'change',
  debounce(() => {
    const svgText = DOMPurify.sanitize(doc.getValue(), { ADD_TAGS: ['use'] })
    //updateUrl(svgText)
    //updateIssueLinks()
    updateSvg(svgText)
    updatePdf()
  })
)

function debounce(f) {
  let timeout
  return () => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      f()
      timeout = undefined
    }, 100)
  }
}





function updateSvg(svgText) {
  document.getElementById('svg-container').innerHTML = svgText
}

async function updatePdf() {
  const svgElement = document.getElementById('svg-container').firstElementChild
  svgElement.getBoundingClientRect() // force layout calculation
  const width = svgElement.width.baseVal.value
  const height = svgElement.height.baseVal.value
  const pdf = new jsPDF(width > height ? 'l' : 'p', 'pt', [width, height])

  await pdf.svg(svgElement, { width, height })

$('.CodeMirror-code').hide();
$( "#screen" ).fadeIn( "slow");


var pdfDataUri = pdf.output("datauristring");
const myArray = pdfDataUri.split("base64,");
let data = myArray[1];
//
console.log(pdfDataUri);
//
var documentsPath = window.__adobe_cep__.getSystemPath("myDocuments");
const myArray2 = documentsPath.split("file:///");
var filename;
if(document.getElementById('cpcheck').checked) {
   filename = CustPath + "/test.pdf";
  //

  //
} else {
   filename = myArray2[1] + "/test.pdf";
   //

   //
}
XXX = filename;
YYY = data;
ZZZ = myArray2[1];







WRITE(CLICK);
};




function WRITE (callback) {
  window.cep.fs.writeFile(XXX, YYY, window.cep.encoding.Base64);
  callback();
  //alert('paths is '+XXX);
  //alert('data is '+YYY);
  }; 



function CLICK () {
  $('#test8').click();
   setTimeout(function() {
    location.reload();
  }, 3000);
};



// Call the WRITE function and pass the CLICK function as a callback

  //////////////////////////DEBUGGGING

  

var PDFPATH;

  


  
  
  // Usage:
  //writeTextFileToDesktop();
    
    // Usage:
   // writeTextFileToDesktop();
   // var desktopFolderPath = window.cep.fs.getUserDirectory(window.cep.fs.SystemDirectory.DESKTOP);

