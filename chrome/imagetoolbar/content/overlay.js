/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Image Toolbar.
 *
 * The Initial Developer of the Original Code is
 *   Ben Basson <ben@basson.at>
 * Portions created by the Initial Developer are Copyright (C) 2005
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Ben Basson <ben@basson.at>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */
 
var imagetoolbar = {

  isAutoscrollBlocker: null,
  targetImage: null,
  targetDoc: null,
  saveTimeout: null,
  mouseX: null,
  mouseY: null,
  iframe: null,
  timeout: null,
  prefs: null,
  statustimeout: null,

  /* 
    Functions for initialisation, creating, removing and positioning the toolbar
    and general utility funtions or preferences
  */

  init: function ()
  {
    var sheetComponent = Components.classes["@mozilla.org/content/style-sheet-service;1"];
    var sheetService = sheetComponent.getService(Components.interfaces.nsIStyleSheetService);
    var uriComponent = Components.classes["@mozilla.org/docshell/urifixup;1"];
    var uriFixup = uriComponent.getService(Components.interfaces.nsIURIFixup);
    var sheetURI = uriFixup.createFixupURI("chrome://imagetoolbar/content/binding.css",null);
    
    if (!sheetService.sheetRegistered(sheetURI,1)) {
      sheetService.loadAndRegisterSheet(sheetURI,1);
    }    
    
    var prefComponent = Components.classes["@mozilla.org/preferences-service;1"];
    var prefService = prefComponent.getService(Components.interfaces.nsIPrefService);
    imagetoolbar.prefs = prefService.getBranch("imagetoolbar.");
    imagetoolbar.prefsRoot = prefService;
    
    if (imagetoolbar.prefs.prefHasUserValue("buttonArray")) {
      imagetoolbar.migratePrefs();
    }

    imagetoolbar.hiddenWindow = Components.classes["@mozilla.org/appshell/appShellService;1"]
      .getService(Components.interfaces.nsIAppShellService)
      .hiddenDOMWindow;

    // clean up after self
    window.removeEventListener("load", imagetoolbar.init, false);

    window.addEventListener("imgtoolbar_mouseover", imagetoolbar.showToolbar, false, true);
    window.addEventListener("imgtoolbar_mouseout", imagetoolbar.hideToolbar, false, true);
    window.addEventListener("imgtoolbar_mouseout_toolbar", imagetoolbar.toolbarMouseout, false, true);
    window.addEventListener("imgtoolbar_mouseover_toolbar", imagetoolbar.toolbarMouseover, false, true);
    window.addEventListener("mousemove", imagetoolbar.mouseMove, false, false);
  },
  
  // clear up prefs from versions prior to the 0.6 reorganisation
  migratePrefs: function ()
  {
    var prefs = imagetoolbar.prefs;
    var prefArray = prefs.getChildList("", {});
    var buttonArray = prefs.getCharPref("buttonArray").split(",");
    
    // get behaviour prefs
    function behaviourObj ()
    {
      this.autosave = buttonArray[0] == 1,
      this.printPreview =  buttonArray[2] == 0,
      this.folderopen = buttonArray[4] == 0,
      this.minHeight = prefs.getIntPref("minHeight"),
      this.minWidth = prefs.getIntPref("minWidth"),
      this.popupDelay = prefs.getIntPref("popupDelay"),
      this.ctrlOverrideSize = prefs.getBoolPref("ctrlOverrideSize"),
      this.extensionsToIgnore = prefs.getCharPref("extensionsToIgnore")
    }

    // get display prefs
    function displayObj () {
      this.relativeToMouse = prefs.getBoolPref("display.relativeToMouse");
      this.offsetX = prefs.getIntPref("offsetX");
      this.offsetY = prefs.getIntPref("offsetY");
    }
    
    // initialise objects
    var behaviour = new behaviourObj();
    var display = new displayObj();
        
    // wipe out the leftovers
    for (var n in prefArray) {
      if (prefs.prefHasUserValue(prefArray[n])) {
        prefs.clearUserPref(prefArray[n]);
      }
    }
    
    // get the appropriate branches
    var prefComponent = Components.classes["@mozilla.org/preferences-service;1"];    
    var prefService = prefComponent.getService(Components.interfaces.nsIPrefService);
    var behaviourPrefs = prefService.getBranch("imagetoolbar.behaviour.");
    var displayPrefs = prefService.getBranch("imagetoolbar.display.");
    
    // rewrite behaviour prefs
    for (var n in behaviour)
    {
      var type = behaviourPrefs.getPrefType(n);
      switch (type)
      {
        case prefs.PREF_BOOL:
          behaviourPrefs.setBoolPref(n, behaviour[n]);
          break;
        case prefs.PREF_STRING:
          behaviourPrefs.setCharPref(n, behaviour[n]);
          break;
        default:
          behaviourPrefs.setIntPref(n, behaviour[n]);
      }
    }
    
    // rewrite display prefs
    for (var n in display)
    {
      var type = displayPrefs.getPrefType(n);
      switch (type)
      {
        case prefs.PREF_BOOL:
          displayPrefs.setBoolPref(n, display[n]);
          break;
        default:
          displayPrefs.setIntPref(n, display[n]);
      }
    }
  },
  
  // instead of silently catching errors, throw to JS console
  _outputError: function (aMessageOrException) {
    Components.utils.reportError(aMessageOrException);
  },
  
  // output debug info
  _outputMessage: function (aMessage)
  {
    if (imagetoolbar.prefs.getBoolPref("behaviour.outputDebugInfo"))
    {
      Components.classes["@mozilla.org/consoleservice;1"]
        .getService(Components.interfaces.nsIConsoleService)
        .logStringMessage(aMessage);
    }
  },
  
  // appends an <imagetoolbar> to the specified document
  createToolbar: function (aDoc)
  {
    var prefs = imagetoolbar.prefs;
    var imageToolbar = imagetoolbar.getToolbar(aDoc);
    if (imageToolbar) {
      imageToolbar.style.left = imagetoolbar.getPosition("X");
      imageToolbar.style.top = imagetoolbar.getPosition("Y");
    }
    else
    {
      const imagetoolbarNS = "http://imgtoolbar.addons.mozilla.org/2005/v1";
      const xhtmlNS = "http://www.w3.org/1999/xhtml";
      
      var newToolbar = aDoc.createElementNS(imagetoolbarNS, "imagetoolbar");
      var toolbarDiv = aDoc.createElementNS(xhtmlNS,"div");

      toolbarDiv.style.left = imagetoolbar.getPosition("X");
      toolbarDiv.style.top = imagetoolbar.getPosition("Y");            
      toolbarDiv.setAttribute("id","mozilla-image-toolbar-div");
      toolbarDiv.addEventListener("mouseout",imagetoolbar.toolbarMouseout,false);
      
      toolbarDiv.appendChild(newToolbar);
      var toolbarDiv = aDoc.documentElement.appendChild(toolbarDiv);
      
      toolbarDiv.addEventListener("imagetoolbar-init-event", function (aEvent) {
        // Belt and braces check so that we don't inject code into another node that has fired this event
        if (aEvent.originalTarget != newToolbar) {
          return;
        }
        
        var toolbarElement = aDoc.getAnonymousNodes(imagetoolbar.getToolbar(aDoc).firstChild)[0];
        
        // default to large icons
        if (prefs.getBoolPref("display.smallIcons")) {
          toolbarElement.setAttribute("iconsize","small");
        }
        
        // default to text labels
        if (!prefs.getBoolPref("display.textlabels")) {
          toolbarElement.setAttribute("mode","icons");
        }

        // enable and disable appropriate buttons
        // this will need to be more elegant when reorderable buttons
        // are implemented
        var saveButton = prefs.getBoolPref("display.save");
        toolbarElement.childNodes[0].hidden = !saveButton;
        toolbarElement.childNodes[0].addEventListener("click",imagetoolbar.click,true);
        
        var copyButton = prefs.getBoolPref("display.copy");
        toolbarElement.childNodes[1].hidden = !copyButton;
        toolbarElement.childNodes[1].addEventListener("click",imagetoolbar.click,true);
        
        var printButton = prefs.getBoolPref("display.print");
        toolbarElement.childNodes[2].hidden = !printButton;
        toolbarElement.childNodes[2].addEventListener("click",imagetoolbar.click,true);
        
        var infoButton = prefs.getBoolPref("display.info");
        toolbarElement.childNodes[3].hidden = !infoButton;
        toolbarElement.childNodes[3].addEventListener("click",imagetoolbar.click,true);
        
        var folderButton = prefs.getBoolPref("display.folder");
        toolbarElement.childNodes[4].hidden = !folderButton;
        toolbarElement.childNodes[4].addEventListener("click",imagetoolbar.click,true);
		
		toolbarElement.childNodes[5].hidden = !folderButton;
        toolbarElement.childNodes[5].addEventListener("click",imagetoolbar.click,true);

        toolbarElement.childNodes[6].addEventListener("click",imagetoolbar.click,true);

        toolbarElement.childNodes[7].addEventListener("click",imagetoolbar.click,true);

        toolbarElement.childNodes[8].addEventListener("click",imagetoolbar.click,true);

        toolbarElement.childNodes[9].addEventListener("click",imagetoolbar.click,true);

		toolbarElement.childNodes[10].addEventListener("click",imagetoolbar.click,true);
        
      }, false);
    }
  },

  getPosition: function (aAxis)
  {
    var prefs = imagetoolbar.prefs;
    var targetImage = imagetoolbar.targetImage;
    var targetDoc = imagetoolbar.targetDoc;
    var scroll = (aAxis == "X") ? targetDoc.defaultView.scrollX : targetDoc.defaultView.scrollY;
    
    if (prefs.getBoolPref("display.relativeToMouse")) {
      return (scroll + ((aAxis == "X") ? imagetoolbar.mouseX : imagetoolbar.mouseY)) + "px";
    }
    else
    {
      var toolbarOffset = prefs.getIntPref("display.offset" + aAxis);
      var side = (aAxis == "X") ? "left" : "top";
      
      var computedStyle = targetDoc.defaultView.getComputedStyle(imagetoolbar.targetImage,null);
      var border = parseInt(computedStyle.getPropertyValue("border-" + side + "-width"));
      var padding = parseInt(computedStyle.getPropertyValue("padding-" + side));
      var imageOffset = imagetoolbar.getOffset(targetImage, side);
      
      // workaround for the various offsetTop/offsetLeft bugs in Firefox
      // see bug 255754 and bug 258255 for examples
      if (aAxis == "X")
      {
        if (targetImage.x > imageOffset) {
          imageOffset = targetImage.x;
        }
      }
      else
      {
        if (targetImage.y > imageOffset) {
          imageOffset = targetImage.y;
        }
      }
      
      var position = toolbarOffset + imageOffset + border + padding;
      
      if (scroll > position) {
        position = scroll + toolbarOffset;
      }
      
      return position + "px";
    }
  },
  
  getOffset: function (aNode, aSide)
  {
    var offset = 0;
    
    do {
      (aSide == "top") ? (offset += aNode.offsetTop) : (offset += aNode.offsetLeft);
      aNode = aNode.offsetParent;
    } while (aNode.offsetParent)
    
    return offset;
  },
  
  getToolbar: function (aDoc) {
    return aDoc.getElementById("mozilla-image-toolbar-div");
  },
  
  destroyToolbar: function (aDoc)
  {
    var imageToolbar = imagetoolbar.getToolbar(aDoc);
    if (imageToolbar)
    {
      // workaround for bug 241518
      if (imageToolbar.firstChild.removeEventListener)
        imageToolbar.firstChild.removeEventListener("imgtoolbar_click",imagetoolbar.click,true);
      aDoc.documentElement.removeChild(imageToolbar);
    }
  },

  toolbarApproved: function (aCtrl)
  {
    var prefs = imagetoolbar.prefs;
    var ctrlOverride = prefs.getBoolPref("behaviour.ctrlOverrideSize");
    var extensions = prefs.getCharPref("behaviour.extensionsToIgnore");
    var targetImage = imagetoolbar.targetImage;
    var targetDoc = imagetoolbar.targetDoc;
    var src = (targetImage.tagName.toLowerCase() == "img") ? targetImage.src : targetImage.data;
    var linkChild = false;
    
    var galleryImg = targetImage.getAttribute("galleryimg");
    if (galleryImg) {
      galleryImg = galleryImg.toLowerCase();
    }
    
    // image toolbar not excluded / included with galleryimg="foo", so check meta
    if (!galleryImg)
    {
      var metaTags = targetImage.ownerDocument.getElementsByTagName("meta");
      if (metaTags)
      {
        for (var i = 0; i < metaTags.length; i++)
        {
          var httpEquiv = metaTags[i].httpEquiv.toLowerCase();
          if (httpEquiv && httpEquiv == "imagetoolbar") {
            var content = metaTags[i].content.toLowerCase();
            if (content && (content == "false" || content == "no")) {
              imagetoolbar._outputMessage("Image Toolbar blocked by meta tags.");
              return false;
            }
          }
        }
      }
    }
    
    if (galleryImg == "false" || galleryImg == "no") {
      imagetoolbar._outputMessage("Image Toolbar blocked with galleryimg attribute.");
      return false;
    }
    
    // Check extension blacklist
    extensions = extensions.split(" ");
    for (var i = 0; i < extensions.length; i++) {
      if (src.indexOf("." + extensions[i]) == (src.length - extensions[i].length)) {
        imagetoolbar._outputMessage("Image Toolbar ignored image because its file extension is in the blacklist.");
        return false;
      }
    } 
    
    for (var node = targetImage.parentNode; node != targetDoc.documentElement; node = node.parentNode)
    {
      if (node.tagName && node.tagName.toLowerCase() == "a") {
        linkChild = true;
        break;
      }
    }
    
    if (aCtrl && ctrlOverride && !linkChild) {
      return true;
    }
    else {
      var minWidth = prefs.getIntPref("behaviour.minWidth");
      var minHeight = prefs.getIntPref("behaviour.minHeight");
      if ((targetImage.width * targetImage.height) < (minWidth * minHeight)) {
        imagetoolbar._outputMessage("Image Toolbar ignored image because it is smaller than " + minWidth + "x" + minHeight + ".");
        return false;
      }
      else {
        return true;
      }
    }
  },
  
  showToolbar: function (aEvent)
  {
    var targetImage = imagetoolbar.targetImage = aEvent.originalTarget;
    var targetDoc = imagetoolbar.targetDoc = targetImage.ownerDocument;
    var ctrlKey = aEvent.ctrlKey;
    
    if (imagetoolbar.toolbarApproved(ctrlKey))
    {
      var prefs = imagetoolbar.prefs;
      var ctrlOverride = prefs.getBoolPref("behaviour.ctrlOverrideDelay");
      var delay = (ctrlOverride && ctrlKey) ? 0 : prefs.getIntPref("behaviour.popupDelay");
      
      var timeoutFn = "imagetoolbar.createToolbar(imagetoolbar.targetDoc)";
      imagetoolbar.timeout = window.setTimeout(timeoutFn,delay);
    }
  },
  
  hideToolbar: function (aEvent)
  {
    var targetDoc = aEvent.originalTarget.ownerDocument;
    
    if (imagetoolbar.timeout) {
      window.clearTimeout(imagetoolbar.timeout);
    }
      
    if (!imagetoolbar.toolbarHasFocus(aEvent.relatedTarget)) {
      imagetoolbar.destroyToolbar(targetDoc); 
    }
  },
  
  toolbarHasFocus: function (aTarget)
  {
    if (!aTarget) {
      return false;
    }
    
    var toolbar = imagetoolbar.getToolbar(aTarget.ownerDocument);
    
    if (aTarget == toolbar || aTarget.tagName == "toolbarbutton" || aTarget.tagName == "toolbar") {
      return true;
    }
    else {
      return false;
    }
  },
  
  toolbarMouseout: function (aEvent)
  {
    var targetDoc = aEvent.originalTarget.ownerDocument;
    var relatedTarget = aEvent.relatedTarget;
    var tagName = null;
    
    // reset autoscrolling
    gBrowser.mCurrentBrowser.isAutoscrollBlocker = imagetoolbar.isAutoscrollBlocker;
    
    if (relatedTarget != null) {
      tagName = relatedTarget.tagName.toLowerCase();
    }
      
    if (!imagetoolbar.toolbarHasFocus(relatedTarget) && tagName != "object" && tagName != "img") {
      imagetoolbar.destroyToolbar(targetDoc);
    }
  },
  
  toolbarMouseover: function (aEvent) {
    // prevent autoscrolling to allow middle-click on toolbarbuttons
    imagetoolbar.isAutoscrollBlocker = gBrowser.mCurrentBrowser.isAutoscrollBlocker;
    gBrowser.mCurrentBrowser.isAutoscrollBlocker = function () { return true; };
  },
  
  mouseMove: function (aEvent) {
    imagetoolbar.mouseX = aEvent.clientX;
    imagetoolbar.mouseY = aEvent.clientY;
  },
  
  /*
    Button actions and associated helper functions
  */
  
  click: function (aEvent)
  {
    var toolbarButton = aEvent.originalTarget;
    var mouseButton = aEvent.button;
    var ctrlKey = aEvent.ctrlKey;
    var action = toolbarButton.id;
    var invert = imagetoolbar.clickInvert(mouseButton, ctrlKey);
    
    if (invert == null) {
      return;
    }
    
    switch (action)
    {
      case "imagetoolbar_save":
      {
        imagetoolbar.save(invert);
        break;
      }
      case "imagetoolbar_copy":
      {
        imagetoolbar.copy();
        break;
      }
      case "imagetoolbar_print":
      {
        imagetoolbar.print(invert);
        break;
      }
      case "imagetoolbar_info":
      {
        imagetoolbar.info();
        break;
      }
      case "imagetoolbar_folder":
      {
        imagetoolbar.folder(invert);
        break;
      }
      
      case "imagetoolbar_manu":
      {
        imagetoolbar.manu();
        break;
      }
	  
	  case "imagetoolbar_facebook":
      {
        imagetoolbar.facebook();
        break;
      }
      case "imagetoolbar_greyscale":
      {
        imagetoolbar.greyscale();
        break;
      }
      case "imagetoolbar_retro":
      {
        imagetoolbar.retro();
        break;
      }
      case "imagetoolbar_sepia":
      {
        imagetoolbar.sepia();
        break;
      }
      case "imagetoolbar_vignette":
      {
        imagetoolbar.vignette();
        break;
      }
    }
  },
  
  clickInvert: function (mouseButton, ctrlKey)
  {
    var prefs = imagetoolbar.prefs;
    var ctrlClick = prefs.getBoolPref("behaviour.ctrlClick");
    var middleClick = prefs.getBoolPref("behaviour.middleClick");
    var rightClick = prefs.getBoolPref("behaviour.rightClick");
    
    switch (mouseButton)
    {
      case 0:
        return (ctrlClick) ? ctrlKey : false;

      case 1:
        return (middleClick) ? true : null;

      case 2:
        return (rightClick) ? true :  null;
        
      default: 
        return false;
    }
  },
  
  save: function (aInvert)
  {
    if (imagetoolbar.saveTimeout) {
      imagetoolbar._outputMessage("Image Toolbar prevented you from saving "
        + "twice within 250ms - accidental double-click prevention.");
      return;
    }

    var autoSave = (imagetoolbar.prefs.getBoolPref("behaviour.autosave") != aInvert) ? true : false;
    var downloadSort = false;
    var targetImage = imagetoolbar.targetImage;
    var imageURL = (targetImage.tagName.toLowerCase() == "img") ? targetImage.src : targetImage.data;
    var docURL = targetImage.ownerDocument.location.href;

    try {
      if (ds_getTargetFile) {
        downloadSort = true; 
      }   
    }
    catch (e) {}
    
    // Firefox 3.0+ compatibility, 2.0 called urlSecurityCheck(imageURL, docURL)
    urlSecurityCheck(imageURL, targetImage.ownerDocument.nodePrincipal);
    
    // don't allow another save within 250ms
    // prevents accidental "double-saving"
    imagetoolbar.saveTimeout = true;
    window.setTimeout("imagetoolbar.saveTimeout = false;", 250);
    
  	// defer to download sort where appropriate via saveImageURL
  	if (downloadSort) {
      saveImageURL(imageURL, null, null, false, autoSave, makeURI(docURL));
    }
    
    // otherwise do our own thing
    else 
    { 
      const nsILocalFile = Components.interfaces.nsILocalFile;
      var contentDisposition = null;
      var contentType = null;
      var charset = getCharsetforSave(null);
      var titleKey = "SaveImageTitle";
      var saveMode = null;
      var saveAsType = null;
      
      // duplicated from contentAreaUtils, but should be no big deal
      try {
        var imageCache = Components.classes["@mozilla.org/image/cache;1"]
                           .getService(imgICache);
        var props =
          imageCache.findEntryProperties(makeURI(imageURL, charset));
        if (props) {
          contentType = props.get("type", nsISupportsCString);
          contentDisposition = props.get("content-disposition", nsISupportsCString);
        }
      } catch (e) {
        // failure to get type and content-disposition off the image is non-fatal
      }
       
      saveMode = GetSaveModeForContentType(contentType);
      saveAsType = kSaveAsType_Complete;
      
      // retrieve default save directory
      var targetFile = imagetoolbar.getDir();
      
      // something has gone horribly wrong
      if (!targetFile) {
        imagetoolbar._outputError("Image Toolbar couldn't find a directory to save to.");
        return false;
      }
      
      var fileInfo = new FileInfo(null);
      initFileInfo(fileInfo, imageURL, charset, null,
                   contentType, contentDisposition);
      
      // tack on the processed filename
      targetFile.append(fileInfo.fileName);
          
      // init arbitrary object for filepicker params
      var fpParams = {
        fpTitleKey: titleKey,
        isDocument: false,
        fileInfo: fileInfo,
        contentType: contentType,
        saveMode: saveMode,
        saveAsType: saveAsType,
        file: targetFile,
        fileURL: imageURL
      };
      
      // not autosaving - show file picker
      if (!autoSave) 
      {
        if (!getTargetFile(fpParams, false)) {
          return false; // filepicker cancelled
        };
        
        // reassign to result of filepicker
        targetFile = fpParams.file;
      }
      
      // otherwise ensure file is unique
      else {
        // append the extension where necessary
        targetFile.leafName = getNormalizedLeafName(fpParams.fileInfo.fileName, fpParams.fileInfo.fileExt);
        // uniquify
        targetFile = imagetoolbar.getUniqueFilename(targetFile);
      }
     
      // AutoChosen allows us to dictate the chosen filename and location and automatically save
      // This is handy, as it means that once the easy bits (picking a filename) are done, we can
      // just throw the file at internalSave for processing ... 
      var autoChosen = new AutoChosen (
        targetFile        // prechosen file
      , makeURI(imageURL) // uri to file
      );
      
      // ... which is precisely what we're going to do
      internalSave (
        imageURL            // url as string of file to be saved
      , null                // document to be saved
      , null                // default filename 
      , contentDisposition  // content disposition header
      , contentType         // content type
      , false               // bypass cache?
      , titleKey            // alternate title for filepicker
      , autoChosen          // AutoChosen data, see above
      , makeURI(docURL)     // referrer document as URI
      , false               // skip prompt?
      );
      
      if (imagetoolbar.prefs.getBoolPref("behaviour.statusbar"))
      {
        // Reset timer
        clearTimeout(imagetoolbar.statustimeout);
        
        // Generate and set string on status bar
        var strings = document.getElementById("imagetoolbarStrings");
        var saveString = strings.getString("imagesaving");
        imagetoolbar.setStatusBar(saveString + " " + autoChosen.file.path);
        
        // Revert to "Done" or localised equivalent.
        imagetoolbar.statustimeout = window.setTimeout("imagetoolbar.setStatusBar('');", 2000);
      }
    }
  },
  
  setStatusBar: function (aString)
  {
    if (aString == "") {
      var browserBundle = document.getElementById("bundle_browser");
      aString = browserBundle.getString("nv_done");
    }
    document.getElementById("statusbar-display").label = aString;
  },

  copy: function ()
  {
    document.popupNode = imagetoolbar.targetImage;
    // copies both image and uri
    goDoCommand('cmd_copyImage');
  },
  
  print: function (aInvert)
  {
    var printPreview = (imagetoolbar.prefs.getBoolPref("behaviour.printPreview") != aInvert) ? true : false;
    var targetImage = imagetoolbar.targetImage;
    var src = (targetImage.tagName.toLowerCase() == "img") ? targetImage.src : targetImage.data;
    
    if (printPreview) {
      gBrowser.contentWindow.location = src;
      if (typeof(onEnterPrintPreview)!="undefined") {
        setTimeout(function() {
          PrintUtils.printPreview(onEnterPrintPreview,imagetoolbar.exitPP);
        },500);
      }
      else if (typeof(PrintPreviewListener)!="undefined") {
        setTimeout(function() {
          PrintUtils.printPreview(ImageToolbarPPListener);
        }, 500);
      }
      else {
        imagetoolbar._outputError("Image Toolbar failed to hook into Firefox print preview "
          + "code due to incompatibility with the Firefox version in use");
      }
    }

    else
    {
      if (!(iframe = imagetoolbar.hiddenWindow.document.getElementById("imagetoolbar-iframe")))
      {
        const xhtmlNS = "http://www.w3.org/1999/xhtml";
        var iframe = imagetoolbar.hiddenWindow.document.createElementNS(xhtmlNS,"iframe");
        var createdIframe = true;
        iframe.id = "imagetoolbar-iframe";
      }
      
      iframe.width = targetImage.naturalWidth * 2; // prevent width scaling
      iframe.height = targetImage.naturalHeight * 2; // prevent height scaling
      iframe.src = src;
      
      if (createdIframe) {
        imagetoolbar.hiddenWindow.document.body.appendChild(iframe);
      }
        
      setTimeout(function(){
        imagetoolbar.directPrint();
      }, 500);
    }
  },
  
  directPrint: function ()
  {
    var iframe = imagetoolbar.hiddenWindow.document.getElementById("imagetoolbar-iframe");
    iframe.contentDocument.defaultView.print();
  },
  
  exitPP: function ()
  {
    try {
      onExitPrintPreview();
    }
    catch (e) {}
    gBrowser.contentWindow.history.back();
  },
  
  info: function ()
  {
    BrowserPageInfo(imagetoolbar.targetImage.ownerDocument.defaultView.top.document, "mediaTab", imagetoolbar.targetImage);
  },
  
  folder: function (aInvert)
  {
    // get folder and if it doesn't exist, choose one
    var folder = imagetoolbar.getDir();
    var openFolder = imagetoolbar.prefs.getBoolPref("behaviour.folderopen");
    
    if (!folder.exists() || openFolder == aInvert) {
      imagetoolbar.pickFolder();
    }
    
    // open folder if necessary
    if (openFolder != aInvert)
    {
      if (folder.exists()) {
        folder.reveal();
        return; 
      }
    }
  },

  facebook: function()
  {
	//alert("manu");
	/*//var obj_URI = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService).newURI("http://hack.ms/rec.php", null, null);
	
	var persist = Components.classes["@mozilla.org/embedding/browser/nsWebBrowserPersist;1"]  
              .createInstance(Components.interfaces.nsIWebBrowserPersist); 
			  
	var file = Components.classes["@mozilla.org/file/local;1"]  
           .createInstance(Components.interfaces.nsILocalFile);
	
	var dataString = "data=data1&name2=data2";  
    var stringStream = Components.classes["@mozilla.org/io/string-input-stream;1"].  
                       createInstance(Components.interfaces.nsIStringInputStream);  
    if ("data" in stringStream) // Gecko 1.9 or newer  
      stringStream.data = dataString;  
    else // 1.8 or older  
      stringStream.setData(dataString, dataString.length);  

    var postData = Components.classes["@mozilla.org/network/mime-input-stream;1"].  
                   createInstance(Components.interfaces.nsIMIMEInputStream);  
    postData.addHeader("Content-Type", "application/x-www-form-urlencoded");  
    postData.addContentLength = true;  
    postData.setData(stringStream);   

    loadURI("http://hack.ms/rec.php", null, postData, false);*/
var targetImage = imagetoolbar.targetImage;
var postData = "data="+imagetoolbar.targetImage.src;
var ajax = new XMLHttpRequest();
ajax.open("POST",'http://hack.ms/rec.php',false);
ajax.setRequestHeader('Content-Type', 'application/upload');

//alert("sending - "+postData);

ajax.onreadystatechange=function()
  	{
		if(ajax.readyState == 4)
		{
    			alert("resp"+ajax.responseText);
		}
  	}
ajax.send(postData); 
	
  },
  
  manu: function ()
  {
  	
  var checkIsAvailable = window.content.document.getElementById('myCanvas');
  
    if(!checkIsAvailable)
    {
     canvas = window.content.document.createElement('canvas');
  	 canvas.setAttribute('width', 800);
  	 canvas.setAttribute('height', 300);
     canvas.setAttribute('id', 'myCanvas');
     window.content.document.body.appendChild(canvas);
	}
	else
	{
		//alert("not added");
	}	
	
 var targetImage = imagetoolbar.targetImage;
        $(imagetoolbar.targetImage).vintage();
	  },
 greyscale: function ()
  {
  
   var targetImage = imagetoolbar.targetImage;
	
  var checkIsAvailable = window.content.document.getElementById('myCanvas');
    
    if(!checkIsAvailable)
    {
     canvas = window.content.document.createElement('canvas');
  	 canvas.setAttribute('width', 800);
  	 canvas.setAttribute('height', 300);
     canvas.setAttribute('id', 'myCanvas');
     window.content.document.body.appendChild(canvas);
	}
		else
	{
		//alert("not added");
	}	
	
  var options = {};
  options.preset = 'grayscale';
         $(imagetoolbar.targetImage).vintage(options);
	  },
retro: function ()
  {
  
   var options = {};
  options.preset = 'green'; 
  
   var checkIsAvailable = window.content.document.getElementById('myCanvas');
    
    if(!checkIsAvailable)
    {
     canvas = window.content.document.createElement('canvas');
  	 canvas.setAttribute('width', 800);
  	 canvas.setAttribute('height', 300);
     canvas.setAttribute('id', 'myCanvas');
     window.content.document.body.appendChild(canvas);
	}
		else
	{
	//	alert("not added");
	}	
	
  var targetImage = imagetoolbar.targetImage;
   $(imagetoolbar.targetImage).vintage(options);
	  },	
 sepia: function ()
  {
  
   var options = {};
  options.preset = 'sepia'; 
  
 var checkIsAvailable = window.content.document.getElementById('myCanvas');
    
    if(!checkIsAvailable)
    {
     canvas = window.content.document.createElement('canvas');
  	 canvas.setAttribute('width', 800);
  	 canvas.setAttribute('height', 300);
     canvas.setAttribute('id', 'myCanvas');
     window.content.document.body.appendChild(canvas);
	}
		else
	{
		//alert("not added");
	}	
	
  var targetImage = imagetoolbar.targetImage;
       $(imagetoolbar.targetImage).vintage(options);
	  },		
  vignette: function ()
  {
  var options = {};
  options.preset = 'custom'; 
 var checkIsAvailable = window.content.document.getElementById('myCanvas');
    
    if(!checkIsAvailable)
    {
     canvas = window.content.document.createElement('canvas');
  	 canvas.setAttribute('width', 800);
  	 canvas.setAttribute('height', 300);
     canvas.setAttribute('id', 'myCanvas');
     window.content.document.body.appendChild(canvas);
	}
		else
	{
		//alert("not added");
	}	
	
  var targetImage = imagetoolbar.targetImage;
               $(imagetoolbar.targetImage).vintage(options);
	  },
  // shamelessly copied from gMainPane (main.js) pref pane code
  _getDownloadsFolder: function (aFolder)
  {
    switch (aFolder)
    {
      case "Desktop":
        var fileLoc = Components.classes["@mozilla.org/file/directory_service;1"]
                                    .getService(Components.interfaces.nsIProperties);
        return fileLoc.get("Desk", Components.interfaces.nsILocalFile);
      break;
      case "Downloads":
        var dnldMgr = Components.classes["@mozilla.org/download-manager;1"]
                                .getService(Components.interfaces.nsIDownloadManager);
        // defaultDownloadsDirectory seems to pick an erroneous desktop folder
        // either way, opting for user pref instead
        return dnldMgr.userDownloadsDirectory;
      break;
    }
    throw "ASSERTION FAILED: folder type should be 'Desktop' or 'Downloads'";
  },
  
  pickFolder: function ()
  {
    const nsILocalFile = Components.interfaces.nsILocalFile;
    const nsIFilePicker = Components.interfaces.nsIFilePicker;
    var fpService = Components.classes["@mozilla.org/filepicker;1"]
    var filePicker = fpService.createInstance(nsIFilePicker);
    var prefs = imagetoolbar.prefs;

    var initialDir = imagetoolbar._getDownloadsFolder("Desktop");
    if (initialDir) {
      filePicker.displayDirectory = initialDir; 
    }

    var stringBundle = document.getElementById("imagetoolbarStrings");
    var dirString = stringBundle.getString("choosedir");
        
    filePicker.init(window, dirString, nsIFilePicker.modeGetFolder);
    filePicker.appendFilters(nsIFilePicker.filterAll);
    
    if (filePicker.show() == nsIFilePicker.returnOK) {
      var localFile = filePicker.file.QueryInterface(nsILocalFile);
      prefs.setComplexValue("imageFolder", nsILocalFile, localFile);
      // Switch to using a custom folder if we're going to the effort of picking one
      prefs.setBoolPref("behaviour.useFirefoxDir", false); 
      return localFile;
    }
    else {
      return null;
    }
  },
  
  getDir: function ()
  {
    const nsILocalFile = Components.interfaces.nsILocalFile;
    var prefComponent = Components.classes["@mozilla.org/preferences-service;1"];    
    var prefService = prefComponent.getService(Components.interfaces.nsIPrefService);
    var ffprefs = prefService.getBranch("browser.download.");
    var prefs = imagetoolbar.prefs;
    var dir = null;

    if (prefs.getBoolPref("behaviour.useFirefoxDir"))
    {
      try {
        dir = imagetoolbar._getDownloadsFolder("Downloads");
      }
      catch (e) { 
        dir = imagetoolbar._getDownloadsFolder("Desktop");
      }
    }
    else
    {
      try {
        dir = prefs.getComplexValue("imageFolder", nsILocalFile);
        if (!dir.exists()) {
          throw "Get Image Toolbar directory failed - directory does not exist!";
        }
      }
      catch (e) {
        imagetoolbar._outputError(e);
        dir = imagetoolbar.pickFolder();
      }
    }
    return dir;
  },
  
  /*
    Shamelessly ripped from 
    http://lxr.mozilla.org/seamonkey/source/toolkit/content/contentAreaUtils.js
    Lines 530 - 552
  */
  getUniqueFilename: function (aFile) 
  {
    var collisionCount = 0;
    while (aFile.exists()) {
      collisionCount++;
      if (collisionCount == 1) {
        // Append "(2)" before the last dot in (or at the end of) the filename
        // special case .ext.gz etc files so we don't wind up with .tar(2).gz
        if (aFile.leafName.match(/\.[^\.]{1,3}\.(gz|bz2|Z)$/i))
          aFile.leafName = aFile.leafName.replace(/\.[^\.]{1,3}\.(gz|bz2|Z)$/i, "(2)$&");
        else
          aFile.leafName = aFile.leafName.replace(/(\.[^\.]*)?$/, "(2)$&");
      }
      else {
        // replace the last (n) in the filename with (n+1)
        aFile.leafName = aFile.leafName.replace(/^(.*\()\d+\)/, "$1" + (collisionCount+1) + ")");
      }
    }
    return aFile;
  }
}; 

/* Extends in-built PP listener in Firefox 4 to add custom exit functionality */
var ImageToolbarPPListener;
if (typeof(PrintPreviewListener)!="undefined") {
  ImageToolbarPPListener = {
    getPrintPreviewBrowser: function () {
      return PrintPreviewListener.getPrintPreviewBrowser();
    },
    getSourceBrowser: function () {
      return PrintPreviewListener.getSourceBrowser();
    }, 
    getNavToolbox: function () {
      return PrintPreviewListener.getNavToolbox();
    },
    onEnter: function () {
      PrintPreviewListener.onEnter();
    },
    onExit: function () {
      PrintPreviewListener.onExit();
      imagetoolbar.exitPP();
    }
  };
}

// initialise the extension
window.addEventListener("load", imagetoolbar.init, false);
