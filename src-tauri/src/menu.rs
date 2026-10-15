//! Native menus. macOS shows them in the system menu bar; Windows and Linux show
//! them inside the window under the title bar. Clicking an item sends a "menu"
//! event with the item id to the interface, which does the work.

use tauri::menu::{AboutMetadata, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Emitter, Wry};

fn item(h: &AppHandle, id: &str, text: &str, accel: Option<&str>) -> tauri::Result<MenuItem<Wry>> {
    let mut b = MenuItemBuilder::with_id(id, text);
    if let Some(a) = accel {
        b = b.accelerator(a);
    }
    b.build(h)
}

pub fn install(app: &mut App) -> tauri::Result<()> {
    let h = app.handle().clone();
    let about = AboutMetadata {
        name: Some("Family Tree".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        comments: Some("Build your tree, prove every fact, share the living part privately.".into()),
        ..Default::default()
    };

    let file = SubmenuBuilder::new(&h, "File")
        .item(&item(&h, "new-tree", "New tree…", None)?)
        .item(&item(&h, "open-sample", "Open sample tree", None)?)
        .separator()
        .item(&item(&h, "import-gedcom", "Import GEDCOM…", Some("CmdOrCtrl+I"))?)
        .item(&item(&h, "export-gedcom", "Export GEDCOM…", Some("CmdOrCtrl+E"))?)
        .separator()
        .item(&item(&h, "backup-now", "Back up now", Some("CmdOrCtrl+B"))?)
        .item(&item(&h, "lock", "Lock now", Some("CmdOrCtrl+L"))?)
        .separator()
        .close_window()
        .build()?;

    let edit = SubmenuBuilder::new(&h, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    let view = SubmenuBuilder::new(&h, "View")
        .item(&item(&h, "search", "Search…", Some("CmdOrCtrl+K"))?)
        .separator()
        .item(&item(&h, "go-home", "Home", Some("CmdOrCtrl+1"))?)
        .item(&item(&h, "go-tree", "Tree", Some("CmdOrCtrl+2"))?)
        .item(&item(&h, "go-people", "People", Some("CmdOrCtrl+3"))?)
        .item(&item(&h, "go-sources", "Sources", Some("CmdOrCtrl+4"))?)
        .item(&item(&h, "go-media", "Media", Some("CmdOrCtrl+5"))?)
        .item(&item(&h, "go-research", "Research", Some("CmdOrCtrl+6"))?)
        .separator()
        .item(&item(&h, "toggle-dark", "Light or dark mode", Some("CmdOrCtrl+Shift+D"))?)
        .item(&item(&h, "toggle-density", "Compact or comfortable density", None)?)
        .item(&item(&h, "themes", "Colour theme…", None)?)
        .build()?;

    let tree = SubmenuBuilder::new(&h, "Tree")
        .item(&item(&h, "add-person", "Add person…", Some("CmdOrCtrl+N"))?)
        .item(&item(&h, "add-source", "Add source…", None)?)
        .item(&item(&h, "upload-media", "Upload a photo or document…", Some("CmdOrCtrl+U"))?)
        .item(&item(&h, "new-task", "New research task…", None)?)
        .separator()
        .item(&item(&h, "tree-fit", "Fit tree to window", Some("CmdOrCtrl+0"))?)
        .build()?;

    #[cfg(target_os = "macos")]
    let menu = {
        let help = SubmenuBuilder::new(&h, "Help")
            .item(&item(&h, "shortcuts", "Keyboard shortcuts", Some("CmdOrCtrl+/"))?)
            .item(&item(&h, "data-folder", "Show where my trees are saved", None)?)
            .build()?;
        let app_menu = SubmenuBuilder::new(&h, "Family Tree")
            .about(Some(about))
            .separator()
            .item(&item(&h, "settings", "Settings…", Some("Cmd+,"))?)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        let window = SubmenuBuilder::new(&h, "Window").minimize().maximize().separator().fullscreen().build()?;
        MenuBuilder::new(&h).items(&[&app_menu, &file, &edit, &view, &tree, &window, &help]).build()?
    };

    #[cfg(not(target_os = "macos"))]
    let menu = {
        let tools = SubmenuBuilder::new(&h, "Tools")
            .item(&item(&h, "go-research", "Research tasks and hints", None)?)
            .item(&item(&h, "backups", "Backups…", None)?)
            .separator()
            .item(&item(&h, "settings", "Settings…", Some("Ctrl+,"))?)
            .build()?;
        let help = SubmenuBuilder::new(&h, "Help")
            .item(&item(&h, "shortcuts", "Keyboard shortcuts", Some("Ctrl+/"))?)
            .item(&item(&h, "data-folder", "Show where my trees are saved", None)?)
            .separator()
            .about(Some(about))
            .build()?;
        MenuBuilder::new(&h).items(&[&file, &edit, &view, &tree, &tools, &help]).build()?
    };

    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let _ = app.emit("menu", event.id().0.clone());
    });
    Ok(())
}
