import treeService from './tree.js';
import linkContextMenuService from "../menus/link_context_menu.js";
import appContext from "../components/app_context.js";
import froca from "./froca.js";
import utils from "./utils.js";

function getNotePathFromUrl(url: string) {
    const notePathMatch = /#(root[A-Za-z0-9_/]*)$/.exec(url);

    return notePathMatch === null ? null : notePathMatch[1];
}

async function getLinkIcon(noteId: string, viewMode: ViewMode | undefined) {
    let icon;

    if (!viewMode || viewMode === 'default') {
        const note = await froca.getNote(noteId);

        icon = note?.getIcon();
    } else if (viewMode === 'source') {
        icon = 'bx bx-code-curly';
    } else if (viewMode === 'attachments') {
        icon = 'bx bx-file';
    }
    return icon;
}

type ViewMode = "default" | "source" | "attachments" | string;

export interface ViewScope {
    viewMode?: ViewMode;
    attachmentId?: string;
}

interface CreateLinkOptions {
    title?: string;
    showTooltip?: boolean;
    showNotePath?: boolean;
    showNoteIcon?: boolean;
    referenceLink?: boolean;
    autoConvertToImage?: boolean;
    viewScope?: ViewScope;
}

async function createLink(notePath: string, options: CreateLinkOptions = {}) {
    if (!notePath || !notePath.trim()) {
        logError("Missing note path");

        return $("<span>").text("[missing note]");
    }

    if (!notePath.startsWith("root")) {
        // all note paths should start with "root/" (except for "root" itself)
        // used, e.g., to find internal links
        notePath = `root/${notePath}`;
    }

    const showTooltip = options.showTooltip === undefined ? true : options.showTooltip;
    const showNotePath = options.showNotePath === undefined ? false : options.showNotePath;
    const showNoteIcon = options.showNoteIcon === undefined ? false : options.showNoteIcon;
    const referenceLink = options.referenceLink === undefined ? false : options.referenceLink;
    const autoConvertToImage = options.autoConvertToImage === undefined ? false : options.autoConvertToImage;

    const { noteId, parentNoteId } = treeService.getNoteIdAndParentIdFromUrl(notePath);
    if (!noteId) {
        logError("Missing note ID");

        return $("<span>").text("[missing note]");
    }

    const viewScope = options.viewScope || {};
    const viewMode = viewScope.viewMode || 'default';
    let linkTitle = options.title;

    if (!linkTitle) {
        if (viewMode === 'attachments' && viewScope.attachmentId) {
            const attachment = await froca.getAttachment(viewScope.attachmentId);

            linkTitle = attachment ? attachment.title : '[missing attachment]';
        } else if (noteId) {
            linkTitle = await treeService.getNoteTitle(noteId, parentNoteId);
        }
    }

    const note = await froca.getNote(noteId);

    if (autoConvertToImage && (note?.type && ['image', 'canvas', 'mermaid'].includes(note.type)) && viewMode === 'default') {
        const encodedTitle = encodeURIComponent(linkTitle || "");

        return $("<img>")
            .attr("src", `api/images/${noteId}/${encodedTitle}?${Math.random()}`)
            .attr("alt", linkTitle || "");
    }

    const $container = $("<span>");

    if (showNoteIcon) {
        let icon = await getLinkIcon(noteId, viewMode);

        if (icon) {
            $container
                .append($("<span>").addClass(`bx ${icon}`))
                .append(" ");
        }
    }

    const hash = calculateHash({
        notePath,
        viewScope: viewScope
    });

    const $noteLink = $("<a>", {
        href: hash,
        text: linkTitle
    });

    if (!showTooltip) {
        $noteLink.addClass("no-tooltip-preview");
    }

    if (referenceLink) {
        $noteLink.addClass("reference-link");
    }

    $container.append($noteLink);

    if (showNotePath) {
        const resolvedPathSegments = await treeService.resolveNotePathToSegments(notePath) || [];
        resolvedPathSegments.pop(); // Remove last element

        const resolvedPath = resolvedPathSegments.join("/");
        const pathSegments = await treeService.getNotePathTitleComponents(resolvedPath);

        if (pathSegments) {
            if (pathSegments.length) {
                $container.append($("<small>").append(treeService.formatNotePath(pathSegments)));
            }
        }
    }

    return $container;
}

interface CalculateHashOpts {
    notePath: string;
    ntxId?: string;
    hoistedNoteId?: string;
    viewScope: ViewScope;
}

function calculateHash({notePath, ntxId, hoistedNoteId, viewScope = {}}: CalculateHashOpts) {
    notePath = notePath || "";
    const params = [
        ntxId ? { ntxId: ntxId } : null,
        (hoistedNoteId && hoistedNoteId !== 'root') ? { hoistedNoteId: hoistedNoteId } : null,
        viewScope.viewMode && viewScope.viewMode !== 'default' ? { viewMode: viewScope.viewMode } : null,
        viewScope.attachmentId ? { attachmentId: viewScope.attachmentId } : null
    ].filter(p => !!p);

    const paramStr = params.map(pair => {
        const name = Object.keys(pair)[0];
        const value = (pair as Record<string, string | undefined>)[name];

        return `${encodeURIComponent(name)}=${encodeURIComponent(value || "")}`;
    }).join("&");

    if (!notePath && !paramStr) {
        return "";
    }

    let hash = `#${notePath}`;

    if (paramStr) {
        hash += `?${paramStr}`;
    }

    return hash;
}

function parseNavigationStateFromUrl(url: string | undefined) {
    if (!url) {
        return {};
    }

    const hashIdx = url.indexOf('#');
    if (hashIdx === -1) {
        return {};
    }

    const hash = url.substr(hashIdx + 1); // strip also the initial '#'
    const [notePath, paramString] = hash.split("?");

    if (!notePath.match(/^[_a-z0-9]{4,}(\/[_a-z0-9]{4,})*$/i)) {
        return {};
    }

    const viewScope: ViewScope = {
        viewMode: 'default'
    };
    let ntxId = null;
    let hoistedNoteId = null;
    let searchString = null;

    if (paramString) {
        for (const pair of paramString.split("&")) {
            let [name, value] = pair.split("=");
            name = decodeURIComponent(name);
            value = decodeURIComponent(value);

            if (name === 'ntxId') {
                ntxId = value;
            } else if (name === 'hoistedNoteId') {
                hoistedNoteId = value;
            } else if (name === 'searchString') {
                searchString = value; // supports triggering search from URL, e.g. #?searchString=blabla
            } else if (['viewMode', 'attachmentId'].includes(name)) {
                (viewScope as any)[name] = value;
            } else {
                console.warn(`Unrecognized hash parameter '${name}'.`);
            }
        }
    }

    return {
        notePath,
        noteId: treeService.getNoteIdFromUrl(notePath),
        ntxId,
        hoistedNoteId,
        viewScope,
        searchString
    };
}

function goToLink(evt: MouseEvent) {
    const $link = $(evt.target as any).closest("a,.block-link");
    const hrefLink = $link.attr('href') || $link.attr('data-href');

    return goToLinkExt(evt, hrefLink, $link);
}

function goToLinkExt(evt: MouseEvent, hrefLink: string | undefined, $link: JQuery<HTMLElement>) {
    if (hrefLink?.startsWith("data:")) {
        return true;
    }

    evt.preventDefault();
    evt.stopPropagation();

    const {notePath, viewScope} = parseNavigationStateFromUrl(hrefLink);

    const ctrlKey = utils.isCtrlKey(evt);
    const isLeftClick = evt.which === 1;
    const isMiddleClick = evt.which === 2;
    const openInNewTab = (isLeftClick && ctrlKey) || isMiddleClick;

    const leftClick = evt.which === 1;
    const middleClick = evt.which === 2;

    if (notePath) {
        if (openInNewTab) {
            appContext.tabManager.openTabWithNoteWithHoisting(notePath, {viewScope});
        } else if (isLeftClick) {
            const ntxId = $(evt.target as any).closest("[data-ntx-id]").attr("data-ntx-id");

            const noteContext = ntxId
                ? appContext.tabManager.getNoteContextById(ntxId)
                : appContext.tabManager.getActiveContext();

            noteContext.setNote(notePath, {viewScope}).then(() => {
                if (noteContext !== appContext.tabManager.getActiveContext()) {
                    appContext.tabManager.activateNoteContext(noteContext.ntxId);
                }
            });
        }
    } else if (hrefLink) {
        const withinEditLink = $link?.hasClass("ck-link-actions__preview");
        const outsideOfCKEditor = !$link || $link.closest("[contenteditable]").length === 0;

        if (openInNewTab
            || (withinEditLink && (leftClick || middleClick))
            || (outsideOfCKEditor && (leftClick || middleClick))
        ) {
            if (hrefLink.toLowerCase().startsWith('http') || hrefLink.startsWith("api/")) {
                window.open(hrefLink, '_blank');
            } else if (hrefLink.toLowerCase().startsWith('file:') && utils.isElectron()) {
                const electron = utils.dynamicRequire('electron');
                electron.shell.openPath(hrefLink);
            } else {
                // Enable protocols supported by CKEditor 5 to be clickable.
                // Refer to `allowedProtocols` in https://github.com/TriliumNext/trilium-ckeditor5/blob/main/packages/ckeditor5-build-balloon-block/src/ckeditor.ts.
                // And be consistent with `allowedSchemes` in `src\services\html_sanitizer.ts`
                const allowedSchemes = [
                    'http', 'https', 'ftp', 'ftps', 'mailto', 'data', 'evernote', 'file', 'facetime', 'gemini', 'git',
                    'gopher', 'imap', 'irc', 'irc6', 'jabber', 'jar', 'lastfm', 'ldap', 'ldaps', 'magnet', 'message',
                    'mumble', 'nfs', 'onenote', 'pop', 'rmi', 's3', 'sftp', 'skype', 'sms', 'spotify', 'steam', 'svn', 'udp',
                    'view-source', 'vlc', 'vnc', 'ws', 'wss', 'xmpp', 'jdbc', 'slack', 'tel', 'smb', 'zotero'
                ];
                if (allowedSchemes.some(protocol => hrefLink.toLowerCase().startsWith(protocol+':'))){
                    window.open(hrefLink, '_blank');
                }
            }
        }
    }

    return true;
}

function linkContextMenu(e: PointerEvent) {
    const $link = $(e.target as any).closest("a");
    const url = $link.attr("href") || $link.attr("data-href");

    const { notePath, viewScope } = parseNavigationStateFromUrl(url);

    if (!notePath) {
        return;
    }

    e.preventDefault();

    linkContextMenuService.openContextMenu(notePath, e, viewScope, null);
}

async function loadReferenceLinkTitle($el: JQuery<HTMLElement>, href: string | null | undefined = null) {
    const $link = $el[0].tagName === 'A' ? $el : $el.find("a");

    href = href || $link.attr("href");
    if (!href) {
        console.warn("Empty URL for parsing: " + $el[0].outerHTML);
        return;
    }

    const {noteId, viewScope} = parseNavigationStateFromUrl(href);
    if (!noteId) {
        console.warn("Missing note ID.");
        return;
    }

    const note = await froca.getNote(noteId, true);

    if (note) {
        $el.addClass(note.getColorClass());
    }

    const title = await getReferenceLinkTitle(href);
    $el.text(title);

    if (note) {
        const icon = await getLinkIcon(noteId, viewScope.viewMode);

        if (icon) {
            $el.prepend($("<span>").addClass(icon));
        }
    }
}

async function getReferenceLinkTitle(href: string) {
    const {noteId, viewScope} = parseNavigationStateFromUrl(href);
    if (!noteId) {
        return "[missing note]";
    }

    const note = await froca.getNote(noteId);
    if (!note) {
        return "[missing note]";
    }

    if (viewScope?.viewMode === 'attachments' && viewScope?.attachmentId) {
        const attachment = await note.getAttachmentById(viewScope.attachmentId);

        return attachment ? attachment.title : "[missing attachment]";
    } else {
        return note.title;
    }
}

function getReferenceLinkTitleSync(href: string) {
    const {noteId, viewScope} = parseNavigationStateFromUrl(href);
    if (!noteId) {
        return "[missing note]";
    }

    const note = froca.getNoteFromCache(noteId);
    if (!note) {
        return "[missing note]";
    }

    if (viewScope?.viewMode === 'attachments' && viewScope?.attachmentId) {
        if (!note.attachments) {
            return "[loading title...]";
        }

        const attachment = note.attachments.find(att => att.attachmentId === viewScope.attachmentId);

        return attachment ? attachment.title : "[missing attachment]";
    } else {
        return note.title;
    }
}

// TODO: Check why the event is not supported.
//@ts-ignore
$(document).on('click', "a", goToLink);
// TODO: Check why the event is not supported.
//@ts-ignore
$(document).on('auxclick', "a", goToLink); // to handle the middle button
// TODO: Check why the event is not supported.
//@ts-ignore
$(document).on('contextmenu', 'a', linkContextMenu);
$(document).on('dblclick', "a", e => {
    e.preventDefault();
    e.stopPropagation();

    const $link = $(e.target).closest("a");

    const address = $link.attr('href');

    if (address && address.startsWith('http')) {
        window.open(address, '_blank');
    }
});

$(document).on('mousedown', 'a', e => {
    if (e.which === 2) {
        // prevent paste on middle click
        // https://github.com/zadam/trilium/issues/2995
        // https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event#preventing_default_actions
        e.preventDefault();
        return false;
    }
});

export default {
    getNotePathFromUrl,
    createLink,
    goToLink,
    goToLinkExt,
    loadReferenceLinkTitle,
    getReferenceLinkTitle,
    getReferenceLinkTitleSync,
    calculateHash,
    parseNavigationStateFromUrl
};
